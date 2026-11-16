import { assertBytes, ChartCommandError } from './contracts.js';
import { CHART_CAPABILITIES, CHART_CAPABILITY_SCHEMA_HASH } from './generated/capability-snapshot.js';
import type { CapabilityCatalogDetail, CapabilityCatalogPage, CapabilityCatalogQuery, ChartCapability, StudyCapability } from './capabilities.js';

function catalogSummary(entry: ChartCapability): string {
  if (entry.kind === 'drawing') return 'Drawing';
  if (entry.kind === 'chart') return 'Chart type and price scale';
  return entry.placement === 'pane' ? 'Study in a separate pane' : 'Study on the chart';
}

/**
 * A compact page or exact capability detail from the build-time snapshot, limited to the turn's negotiated kinds.
 * `studies` appends the chart's runtime custom study descriptors after the certified entries.
 */
export function chartCapabilityCatalog(query: CapabilityCatalogQuery, options: { kinds?: readonly ChartCapability['kind'][]; studies?: readonly StudyCapability[] } = {}): CapabilityCatalogPage | CapabilityCatalogDetail {
  assertBytes(query);
  const certifiedIds = new Set<string>(CHART_CAPABILITIES.map(entry => entry.id));
  const all: readonly ChartCapability[] = [...CHART_CAPABILITIES, ...(options.studies ?? []).filter(entry => entry.kind === 'study' && !certifiedIds.has(entry.id))];
  const capabilities = options.kinds ? all.filter(entry => options.kinds!.includes(entry.kind)) : all;
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['id', 'kind', 'search', 'cursor'].includes(key))) throw new ChartCommandError('invalid_input');
  if (query.id !== undefined) {
    if (typeof query.id !== 'string' || !query.id || query.kind !== undefined || query.search !== undefined || query.cursor !== undefined) throw new ChartCommandError('invalid_input');
    const entry = capabilities.find(capability => capability.id === query.id);
    if (!entry) throw new ChartCommandError('unsupported');
    const detail: CapabilityCatalogDetail = { version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, capability: structuredClone(entry) };
    assertBytes(detail);
    return detail;
  }
  if (query.kind !== undefined && !['drawing', 'study', 'chart'].includes(query.kind)) throw new ChartCommandError('invalid_input');
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 256)) throw new ChartCommandError('invalid_input');
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !/^(0|[1-9]\d*)$/.test(query.cursor))) throw new ChartCommandError('invalid_input');
  const offset = query.cursor === undefined ? 0 : Number(query.cursor);
  if (!Number.isSafeInteger(offset)) throw new ChartCommandError('invalid_input');
  const search = query.search?.trim().toLowerCase();
  const entries = capabilities.filter(entry => (!query.kind || entry.kind === query.kind) && (!search || `${entry.title} ${entry.id}`.toLowerCase().includes(search)));
  const page = entries.slice(offset, offset + 20).map(entry => ({ kind: entry.kind, id: entry.id, title: entry.title, summary: catalogSummary(entry) }));
  const result: CapabilityCatalogPage = { version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, entries: page, nextCursor: offset + page.length < entries.length ? String(offset + page.length) : null };
  assertBytes(result);
  return result;
}
