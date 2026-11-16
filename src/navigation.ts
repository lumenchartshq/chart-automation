import { type WorkspaceSync, type ChartSyncOutcome } from './sync.js';
import { ChartCommandError, assertBytes, validateBinding, type ChartBinding } from './contracts.js';

export const CHART_NAVIGATION_VERSION = 1 as const;
export const NAVIGATION_LIMITS = { symbolsPerRead: 20, symbolsPerTurn: 100, mutationsPerTurn: 10 } as const;
export interface ChartSymbolMatch {
  id: string;
  symbol: string;
  instrumentType: string;
  description: string;
  exchange: string;
}
export interface ChartNavigationContext {
  version: 1;
  workspaceId: string;
  chartId: string;
  ready: boolean;
  intervals: string[];
  operations: ('selection' | 'range' | 'fit' | 'latest')[];
  timezone: string;
  /** `revision` is the workspace document revision that holds these switches. */
  sync?: WorkspaceSync & { revision: number; chartIds: string[] };
  unsupported: { operation: string; reason: string }[];
}
export type ChartSelectionIntent = { chartId: string; symbolId?: string; interval?: string };
export type ChartViewIntent = { chartId: string } & (
  | { action: 'range'; from: number; to: number }
  | { action: 'fit' | 'latest' }
);
/** Selection commits and viewport outcomes have no drawing document or Undo revision. */
export interface ChartNavigationReceipt {
  version: 1;
  operationId: string;
  chartId: string;
  state: 'committed' | 'applied';
  selectionRevision: number;
  selection?: { symbol: string; instrumentType: string; interval: string };
  binding?: ChartBinding;
  visibleRange?: { from: number; to: number } | null;
  coverage?: { from: number | null; to: number | null };
  sync?: { version: 1; revision: number; time: boolean; dateRange: boolean; charts: ChartSyncOutcome[] };
}

function inputRecord(value: unknown): Record<string, unknown> {
  assertBytes(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ChartCommandError('invalid_input');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new ChartCommandError('invalid_input');
}
export function validateSymbolSearch(value: unknown): { query: string; limit: number } {
  const v = inputRecord(value);
  exactKeys(v, ['query', 'limit']);
  if (typeof v.query !== 'string' || !v.query.trim() || v.query.length > 100) throw new ChartCommandError('invalid_input');
  if (!Number.isSafeInteger(v.limit) || Number(v.limit) < 1 || Number(v.limit) > NAVIGATION_LIMITS.symbolsPerRead) throw new ChartCommandError('limit_exceeded');
  return { query: v.query.trim(), limit: Number(v.limit) };
}
export function validateSelectionIntent(value: unknown): ChartSelectionIntent {
  const v = inputRecord(value);
  exactKeys(v, ['chartId', 'symbolId', 'interval']);
  id(v.chartId);
  if (v.symbolId !== undefined) id(v.symbolId);
  if (v.interval !== undefined) id(v.interval);
  if (v.symbolId === undefined && v.interval === undefined) throw new ChartCommandError('invalid_input');
  return structuredClone(v) as ChartSelectionIntent;
}
export function validateViewIntent(value: unknown): ChartViewIntent {
  const v = inputRecord(value);
  id(v.chartId);
  if (v.action === 'range') {
    exactKeys(v, ['chartId', 'action', 'from', 'to']);
    if (!Number.isSafeInteger(v.from) || !Number.isSafeInteger(v.to) || Number(v.from) >= Number(v.to)) throw new ChartCommandError('invalid_input');
  } else {
    exactKeys(v, ['chartId', 'action']);
    if (v.action !== 'fit' && v.action !== 'latest') throw new ChartCommandError('unsupported');
  }
  return structuredClone(v) as ChartViewIntent;
}
export function validateNavigationReceipt(value: unknown): ChartNavigationReceipt {
  const v = inputRecord(value);
  exactKeys(v, ['version', 'operationId', 'chartId', 'state', 'selectionRevision', 'selection', 'binding', 'visibleRange', 'coverage', 'sync']);
  if (v.version !== 1 || !['committed', 'applied'].includes(String(v.state))) throw new ChartCommandError('invalid_input');
  id(v.operationId); id(v.chartId);
  if (!Number.isSafeInteger(v.selectionRevision) || Number(v.selectionRevision) < 0) throw new ChartCommandError('invalid_input');
  if (v.selection !== undefined) {
    const selection = inputRecord(v.selection);
    exactKeys(selection, ['symbol', 'instrumentType', 'interval']);
    id(selection.symbol); id(selection.instrumentType); id(selection.interval);
  }
  if (v.binding !== undefined) validateBinding(v.binding);
  if (v.state === 'applied' && !v.binding) throw new ChartCommandError('invalid_input');
  for (const key of ['visibleRange', 'coverage']) {
    if (v[key] === undefined || v[key] === null) continue;
    const range = inputRecord(v[key]); exactKeys(range, ['from', 'to']);
    if (key === 'coverage' && range.from === null && range.to === null) continue;
    if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || Number(range.from) > Number(range.to)) throw new ChartCommandError('invalid_input');
  }
  if (v.sync !== undefined) {
    const sync = inputRecord(v.sync); exactKeys(sync, ['version', 'revision', 'time', 'dateRange', 'charts']);
    if (typeof sync.time !== 'boolean' || typeof sync.dateRange !== 'boolean' || sync.version !== 1 || !Number.isSafeInteger(sync.revision) || Number(sync.revision) < 0 || !Array.isArray(sync.charts) || sync.charts.length > 2) throw new ChartCommandError('invalid_input');
    if (new Set(sync.charts.map(item => item?.chartId)).size !== sync.charts.length) throw new ChartCommandError('invalid_input');
    for (const item of sync.charts) {
      const row = inputRecord(item); exactKeys(row, ['chartId', 'state', 'code', 'visibleRange']); id(row.chartId);
      if ((row.state === 'applied' && (row.code !== undefined || row.visibleRange == null)) || !['applied', 'rejected'].includes(String(row.state)) || (row.state === 'rejected' && !['missing_history', 'unavailable', 'busy'].includes(String(row.code)))) throw new ChartCommandError('invalid_input');
      if (row.visibleRange != null) { const range = inputRecord(row.visibleRange); exactKeys(range, ['from', 'to']); if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || Number(range.from) > Number(range.to)) throw new ChartCommandError('invalid_input'); }
    }
  }
  return structuredClone(v) as unknown as ChartNavigationReceipt;
}
