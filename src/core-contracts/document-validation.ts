import { ChartCommandError } from './errors.js';
import type { ChartBinding, ChartDocumentPayload, ChartPane, DrawingDocument, StudyDocument } from './documents.js';
import { isStudyPaneId, STUDY_MAIN_PANE_ID } from './panes.js';
export const CHART_DOCUMENT_LIMITS = { documentBytes: 2 * 1024 * 1024, savedStudies: 100, savedPanes: 100, comparisons: 4 } as const;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ChartCommandError('invalid_input');
}
const exact = keys;
function string(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > 256) throw new ChartCommandError('invalid_input');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new ChartCommandError('invalid_input');
}
function integer(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ChartCommandError('invalid_input');
}
function revision(value: unknown): void { integer(value); }
export function assertBytes(value: unknown, limit = 256 * 1024): void {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new ChartCommandError("invalid_input");
  }
  if (json === undefined) throw new ChartCommandError("invalid_input");
  if (new TextEncoder().encode(json).byteLength > limit)
    throw new ChartCommandError("limit_exceeded");
}
export function validateDocument(value: unknown): DrawingDocument {
  assertBytes(value, CHART_DOCUMENT_LIMITS.documentBytes);
  const v = record(value);
  keys(v, ["version", "documentId", "revision", "payload"]);
  if (v.version !== 1) throw new ChartCommandError("unsupported");
  string(v.documentId);
  integer(v.revision);
  record(v.payload);
  return structuredClone(v) as unknown as DrawingDocument;
}
export function sameBinding(left: ChartBinding, right: ChartBinding): boolean {
  return (
    left.documentId === right.documentId &&
    left.instanceId === right.instanceId &&
    left.epoch === right.epoch &&
    left.interval === right.interval &&
    left.revision === right.revision &&
    left.symbol.ticker === right.symbol.ticker &&
    (left.symbol.currencyId ?? null) === (right.symbol.currencyId ?? null) &&
    (left.symbol.unitId ?? null) === (right.symbol.unitId ?? null)
  );
}
export const CHART_MAIN_SOURCE = 'main';
export const CHART_SCRIPT_SOURCE = 'script';
/** Reserved Lumen Script source id written by older charts; read and upgraded to `CHART_SCRIPT_SOURCE`. */
export const LEGACY_CHART_SCRIPT_SOURCE = 'pine';
export function sameStudyBinding(left: ChartBinding, right: ChartBinding): boolean {
  return sameBinding({ ...left, revision: 0 }, { ...right, revision: 0 });
}
export function validateStudyDocument(value: unknown): StudyDocument {
  const doc = record(value); exact(doc, ['version', 'documentId', 'chartId', 'revision', 'payload']);
  if (doc.version !== 1) throw new ChartCommandError('unsupported');
  id(doc.documentId); id(doc.chartId); integer(doc.revision);
  const payload = record(doc.payload);
  exact(payload, ['version', 'panes', 'studies', 'comparisons', 'priceScales']);
  if (payload.version !== STUDY_DOCUMENT_PAYLOAD_VERSION) throw new ChartCommandError('unsupported');
  if (!Array.isArray(payload.studies) || payload.studies.length > CHART_DOCUMENT_LIMITS.savedStudies || !Array.isArray(payload.comparisons) || payload.comparisons.length > CHART_DOCUMENT_LIMITS.comparisons || !Array.isArray(payload.panes) || payload.panes.length > CHART_DOCUMENT_LIMITS.savedPanes) throw new ChartCommandError('limit_exceeded');
  const ids = new Set<string>();
  const add = (value: unknown) => {
    id(value);
    if (ids.has(value) || value === CHART_MAIN_SOURCE) throw new ChartCommandError('invalid_input');
    ids.add(value);
  };
  const studies = Array.from(payload.studies, (raw: unknown) => {
    const study = record(raw); add(study.id);
    // Built-in studies carry `@chart-studies-N` ids; any other id is an integrator's custom indicator.
    const source = record(study.source); exact(source, ['type', 'studyId']); id(source.studyId);
    if (source.type !== 'java') throw new ChartCommandError('unsupported');
    return study;
  });
  const comparisons = Array.from(payload.comparisons, (raw: unknown) => {
    const comparison = validateComparisonRecord(raw);
    add(comparison.id);
    return comparison;
  });
  const placed = new Set<string>();
  const paneIds = new Set<string>();
  const panes = Array.from(payload.panes, (raw: unknown): ChartPane => {
    const pane = record(raw); exact(pane, ['id', 'height', 'collapsed', 'sources']);
    if (!isStudyPaneId(pane.id) || paneIds.has(pane.id)) throw new ChartCommandError('invalid_input');
    paneIds.add(pane.id);
    if (typeof pane.height !== 'number' || !Number.isFinite(pane.height) || pane.height < 0 || typeof pane.collapsed !== 'boolean' || !Array.isArray(pane.sources)) throw new ChartCommandError('invalid_input');
    if (!pane.sources.length) throw new ChartCommandError('invalid_input');
    const sources = Array.from(pane.sources, (source: unknown) => {
      if (typeof source !== 'string' || placed.has(source)) throw new ChartCommandError('invalid_input');
      placed.add(source);
      return source;
    });
    if (sources.includes(CHART_MAIN_SOURCE) !== (pane.id === STUDY_MAIN_PANE_ID)) throw new ChartCommandError('invalid_input');
    return { id: pane.id, height: pane.height, collapsed: pane.collapsed, sources };
  });
  // A source called `script` could be a native study in an old document.
  // The placement is whichever reserved source is not owned by a study.
  const legacy = !ids.has(LEGACY_CHART_SCRIPT_SOURCE) && placed.has(LEGACY_CHART_SCRIPT_SOURCE);
  const placement = legacy ? LEGACY_CHART_SCRIPT_SOURCE : CHART_SCRIPT_SOURCE;
  if (!placed.has(CHART_MAIN_SOURCE) || !placed.has(placement) || ids.has(placement)
    || placed.size !== ids.size + 2 || [...ids].some(studyId => !placed.has(studyId))) throw new ChartCommandError('invalid_input');
  const scales = record(payload.priceScales);
  if (Object.keys(scales).some(key => !key.startsWith('study:') || !ids.has(key.slice('study:'.length)))) throw new ChartCommandError('invalid_input');
  assertBytes(doc, CHART_DOCUMENT_LIMITS.documentBytes);
  const result = structuredClone<StudyDocument>({
    version: 1, documentId: doc.documentId, chartId: doc.chartId, revision: doc.revision,
    payload: { version: STUDY_DOCUMENT_PAYLOAD_VERSION, studies, comparisons, panes, priceScales: scales },
  });
  if (legacy) {
    upgradeLegacyPlacement(result.payload, ids);
    assertBytes(result, CHART_DOCUMENT_LIMITS.documentBytes);
  }
  return result;
}
function upgradeLegacyPlacement(payload: ChartDocumentPayload, ids: ReadonlySet<string>): void {
  // The new reserved id cannot belong to a native record. Move its references
  // together, including any custom price scale shared with another study.
  if (ids.has(CHART_SCRIPT_SOURCE)) {
    let suffix = 1;
    while (ids.has(`${CHART_SCRIPT_SOURCE}-${suffix}`)) suffix++;
    const studyId = `${CHART_SCRIPT_SOURCE}-${suffix}`;
    const oldScale = `study:${CHART_SCRIPT_SOURCE}`;
    const newScale = `study:${studyId}`;
    for (const study of [...payload.studies, ...payload.comparisons]) {
      if (study.id === CHART_SCRIPT_SOURCE) study.id = studyId;
      if (study.preferredPriceScale === oldScale) study.preferredPriceScale = newScale;
      const binding = study.scaleBinding;
      if (binding && typeof binding === 'object' && 'scaleId' in binding && binding.scaleId === oldScale) binding.scaleId = newScale;
    }
    if (Object.hasOwn(payload.priceScales, oldScale)) {
      payload.priceScales[newScale] = payload.priceScales[oldScale];
      delete payload.priceScales[oldScale];
    }
    for (const pane of payload.panes) pane.sources = pane.sources.map(source => source === CHART_SCRIPT_SOURCE ? studyId : source);
  }
  for (const pane of payload.panes) pane.sources = pane.sources.map(source => source === LEGACY_CHART_SCRIPT_SOURCE ? CHART_SCRIPT_SOURCE : source);
}
export const STUDY_DOCUMENT_PAYLOAD_VERSION = 3 as const;
export function validateComparisonRecord(value: unknown): Record<string, unknown> {
  const study = record(value); id(study.id);
  const source = record(study.source); exact(source, ['type', 'studyId', 'comparison']);
  if (source.type !== 'compare' || source.studyId !== 'Compare@charting-library-1') throw new ChartCommandError('unsupported');
  const identity = record(source.comparison);
  if (identity.version !== 1) throw new ChartCommandError('unsupported');
  id(identity.symbol);
  const insert = record(study.insert), inputs = record(insert.inputValues);
  if (inputs.symbol !== identity.symbol || inputs.option !== identity.option) throw new ChartCommandError('invalid_input', 'Comparison identity and inputs must agree');
  if (!['same', 'same_percentage', 'new_price_scale', 'new_pane'].includes(String(identity.option))) throw new ChartCommandError('unsupported');
  if (study.comparison !== undefined && JSON.stringify(study.comparison) !== JSON.stringify(source.comparison)) throw new ChartCommandError('invalid_input');
  return study;
}
