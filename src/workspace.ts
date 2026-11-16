import { validateComparisonRecord } from './core-contracts/index.js';
export { validateComparisonRecord } from './core-contracts/index.js';
import { initialWorkspaceSync, validateWorkspaceSync, type ChartWorkspaceSyncApi, type WorkspaceSync } from './sync.js';
import { ChartCommandError, assertBytes, validateBinding, type ChartBinding } from './contracts.js';

export const CHART_WORKSPACE_VERSION = 1 as const;
export const WORKSPACE_LAYOUTS = ['single', 'two_columns', 'two_rows'] as const;
/** Canonical interval IDs accepted by the Lumen Script workspace host and owner. */
export const WORKSPACE_INTERVALS: readonly string[] = ['1', '5', '15', '30', '60', '240', '1D', '1W'];
export type WorkspaceLayout = typeof WORKSPACE_LAYOUTS[number];
export const WORKSPACE_LIMITS = { charts: 2, mutationsPerTurn: 10, documentBytes: 256 * 1024 } as const;
export interface WorkspaceSelection { symbol: string; symbolId: string; instrumentType: string; interval: string }
/** Drawing and chart (studies, comparisons, panes) envelopes are separate, chart-owned documents. */
export interface WorkspaceChart {
  id: string;
  documentId: string;
  selection: WorkspaceSelection;
}
export interface WorkspaceDocument {
  version: 1;
  workspaceId: string;
  revision: number;
  primaryChartId: string;
  activeChartId: string;
  layout: WorkspaceLayout;
  slots: string[];
  /** Stable creation order, including dormant charts; never reordered or removed. */
  charts: WorkspaceChart[];
  sync: WorkspaceSync;
}
export interface WorkspaceContext {
  version: 1;
  document: WorkspaceDocument;
  limits: { charts: number };
  layouts: WorkspaceLayout[];
}
export interface WorkspaceReceipt {
  version: 1;
  operationId: string;
  workspaceId: string;
  revision: number;
  state: 'committed' | 'applied';
  charts: { chartId: string; state: 'committed' | 'applied'; code?: string; binding?: ChartBinding }[];
  /** False for a confirmed timeframe selection whose datasets are still loading. */
  dataReady?: boolean;
  /** Identifies the applied selection; dataReady separately describes dataset readiness. */
  binding?: ChartBinding;
}
export interface PreparedWorkspace { operationId: string; document: WorkspaceDocument }
export interface ChartWorkspaceOptions { document: WorkspaceDocument; maxCharts: number }
/** Native collection layout boundary. Host owns durable selections and child documents. */
export interface ChartWorkspaceApi {
  readonly version: 1;
  readonly sync?: ChartWorkspaceSyncApi;
  context(): WorkspaceContext;
  prepare(operationId: string, document: WorkspaceDocument): PreparedWorkspace;
  commit(operationId: string): WorkspaceDocument;
  acquireMutationLease(operationId: string): () => void;
  discard(operationId: string): void;
  restore(document: WorkspaceDocument): void;
  /** A manual sync toggle: applied natively and announced as a document change. */
  setSync(sync: WorkspaceSync): void;
  /** Acknowledge durability without applying layout, selection or focus. */
  updatePersistenceRevision(revision: number): void;
  chartIndex(chartId: string): number;
  activeChartId(): string;
  /** Optional synchronous timeframe acceptance; does not promise loaded candles. */
  selectInterval?(chartId: string, interval: string, signal: AbortSignal): void;
  setSelection(chartId: string, symbol: string, interval: string, signal: AbortSignal): Promise<void>;
  comparisons(chartId: string): ChartComparisonApi;
  subscribe(listener: (change?: "focus" | "document") => void): () => void;
  destroy(): void;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ChartCommandError('invalid_input');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new ChartCommandError('invalid_input');
}
export function validateWorkspaceSelection(value: unknown): WorkspaceSelection {
  const input = record(value); exact(input, ['symbol', 'symbolId', 'instrumentType', 'interval']);
  Object.values(input).forEach(id);
  for (const key of ['symbol', 'symbolId', 'instrumentType', 'interval']) id(input[key]);
  return structuredClone(input) as unknown as WorkspaceSelection;
}
export function validateWorkspaceDocument(value: unknown, maxCharts: number = WORKSPACE_LIMITS.charts): WorkspaceDocument {
  assertBytes(value, WORKSPACE_LIMITS.documentBytes);
  const doc = record(value); exact(doc, ['version', 'workspaceId', 'revision', 'primaryChartId', 'activeChartId', 'layout', 'slots', 'charts', 'sync']);
  if (doc.version !== 1) throw new ChartCommandError('unsupported');
  id(doc.workspaceId); id(doc.primaryChartId); id(doc.activeChartId);
  if (!Number.isSafeInteger(doc.revision) || Number(doc.revision) < 0) throw new ChartCommandError('invalid_input');
  if (!WORKSPACE_LAYOUTS.includes(doc.layout as WorkspaceLayout)) throw new ChartCommandError('unsupported');
  if (!Number.isSafeInteger(maxCharts) || maxCharts < 1 || maxCharts > WORKSPACE_LIMITS.charts) throw new ChartCommandError('invalid_input');
  if (!Array.isArray(doc.charts) || !doc.charts.length || doc.charts.length > WORKSPACE_LIMITS.charts) throw new ChartCommandError('limit_exceeded');
  const ids = new Set<string>(); const documents = new Set<string>();
  for (const raw of doc.charts) {
    const chart = record(raw); exact(chart, ['id', 'documentId', 'selection']);
    id(chart.id); id(chart.documentId); validateWorkspaceSelection(chart.selection);
    if (ids.has(chart.id) || documents.has(chart.documentId)) throw new ChartCommandError('invalid_input');
    ids.add(chart.id); documents.add(chart.documentId);
  }
  const primary = doc.charts[0] as WorkspaceChart;
  if (primary.id !== doc.primaryChartId || primary.documentId !== doc.workspaceId) throw new ChartCommandError('stale_binding');
  const count = doc.layout === 'single' ? 1 : 2;
  if (count > maxCharts) throw new ChartCommandError('unsupported');
  if (!Array.isArray(doc.slots) || doc.slots.length !== count || new Set(doc.slots).size !== count || doc.slots.some(value => !ids.has(value)) || !doc.slots.includes(doc.activeChartId)) throw new ChartCommandError('invalid_input');
  // Primary Lumen Script remains mounted even while the secondary is dormant.
  if (!doc.slots.includes(doc.primaryChartId)) throw new ChartCommandError('unsupported');
  validateWorkspaceSync(doc.sync);
  return structuredClone(doc) as unknown as WorkspaceDocument;
}
/** Geometry is not involved in migrating the existing primary document. */
export function initialWorkspace(workspaceId: string, selection: WorkspaceSelection): WorkspaceDocument {
  return validateWorkspaceDocument({ version: 1, workspaceId, revision: 0, primaryChartId: `${workspaceId}:primary`, activeChartId: `${workspaceId}:primary`, layout: 'single', slots: [`${workspaceId}:primary`], charts: [{ id: `${workspaceId}:primary`, documentId: workspaceId, selection }], sync: initialWorkspaceSync() });
}
/** Existing identities and dormant document references cannot be dropped by a save. */
export function validateWorkspaceTransition(previous: WorkspaceDocument, next: WorkspaceDocument): void {
  validateWorkspaceDocument(previous); validateWorkspaceDocument(next);
  if (next.workspaceId !== previous.workspaceId || next.primaryChartId !== previous.primaryChartId || next.revision !== previous.revision + 1 || next.charts.length < previous.charts.length) throw new ChartCommandError('revision_conflict');
  for (const [index, chart] of previous.charts.entries()) {
    if (next.charts[index]?.id !== chart.id || next.charts[index]?.documentId !== chart.documentId) throw new ChartCommandError('stale_binding');
  }
}

/** A saved comparison record; the chart codec owns canonical study/scale values. */

export type ComparisonOperation =
  | { action: 'add'; symbolId: string; scale: 'main' | 'own'; normalization: 'raw' }
  | { action: 'remove'; id: string };
export function validateComparisonOperation(value: unknown): ComparisonOperation {
  const op = record(value);
  if (op.action === 'add') {
    exact(op, ['action', 'symbolId', 'scale', 'normalization']); id(op.symbolId);
    if (!['main', 'own'].includes(String(op.scale)) || op.normalization !== 'raw') throw new ChartCommandError('unsupported');
  } else if (op.action === 'remove') { exact(op, ['action', 'id']); id(op.id); }
  else throw new ChartCommandError('unsupported');
  return structuredClone(op) as unknown as ComparisonOperation;
}
export interface ComparisonSummary { id: string; symbol: string; scale: string; normalization: 'raw' | 'percentage'; editable: boolean }
/** Comparison series readiness. Comparisons are saved and edited through the chart document. */
export interface ChartComparisonApi {
  waitForReady(signal: AbortSignal, options?: { retryFailed?: boolean }): Promise<void>;
  list(): ComparisonSummary[];
  destroy(): void;
}
export type WorkspaceIntent = { expectedRevision: number } & (
  | { action: 'layout'; layout: WorkspaceLayout; reverse?: boolean; primary?: { symbolId: string; interval: string }; secondary?: { symbolId: string; interval: string } }
  | { action: 'activate'; chartId: string }
  | { action: 'selection'; chartId: string; symbolId?: string; interval?: string }
);
export function validateWorkspaceIntent(value: unknown): WorkspaceIntent {
  assertBytes(value); const input = record(value);
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) throw new ChartCommandError('invalid_input');
  if (input.action === 'layout') {
    exact(input, ['action', 'expectedRevision', 'layout', 'reverse', 'primary', 'secondary']);
    if (!WORKSPACE_LAYOUTS.includes(input.layout as WorkspaceLayout)) throw new ChartCommandError('unsupported');
    if (input.reverse !== undefined && typeof input.reverse !== 'boolean') throw new ChartCommandError('invalid_input');
    if (input.primary !== undefined) { const primary = record(input.primary); exact(primary, ['symbolId', 'interval']); id(primary.symbolId); id(primary.interval); }
    if (input.secondary !== undefined) { const secondary = record(input.secondary); exact(secondary, ['symbolId', 'interval']); id(secondary.symbolId); id(secondary.interval); if (input.layout === 'single') throw new ChartCommandError('invalid_input'); }
  } else if (input.action === 'activate') { exact(input, ['action', 'expectedRevision', 'chartId']); id(input.chartId); }
  else if (input.action === 'selection') {
    exact(input, ['action', 'expectedRevision', 'chartId', 'symbolId', 'interval']); id(input.chartId);
    if (input.symbolId !== undefined) id(input.symbolId);
    if (input.interval !== undefined) id(input.interval);
    if (input.symbolId === undefined && input.interval === undefined) throw new ChartCommandError('invalid_input');
  } else throw new ChartCommandError('unsupported');
  return structuredClone(input) as unknown as WorkspaceIntent;
}
export function validateWorkspaceReceipt(value: unknown): WorkspaceReceipt {
  assertBytes(value); const receipt = record(value);
  exact(receipt, ['version', 'operationId', 'workspaceId', 'revision', 'state', 'charts', 'binding', 'dataReady']);
  if (receipt.version !== 1 || !['committed', 'applied'].includes(String(receipt.state))) throw new ChartCommandError('unsupported');
  if (receipt.dataReady !== undefined && typeof receipt.dataReady !== 'boolean') throw new ChartCommandError('invalid_input');
  if (receipt.dataReady === false && receipt.state !== 'applied') throw new ChartCommandError('invalid_input');
  id(receipt.operationId); id(receipt.workspaceId);
  if (!Number.isSafeInteger(receipt.revision) || Number(receipt.revision) < 1) throw new ChartCommandError('invalid_input');
  if (!Array.isArray(receipt.charts) || !receipt.charts.length || receipt.charts.length > WORKSPACE_LIMITS.charts) throw new ChartCommandError('invalid_input');
  const ids = new Set<string>();
  for (const raw of receipt.charts) {
    const chart = record(raw); exact(chart, ['chartId', 'state', 'code', 'binding']); id(chart.chartId);
    if (ids.has(chart.chartId) || !['applied', 'committed'].includes(String(chart.state))) throw new ChartCommandError('invalid_input'); ids.add(chart.chartId);
    if (chart.binding !== undefined) validateBinding(chart.binding);
    if (chart.code !== undefined) id(chart.code);
    if (chart.state === 'applied' && (chart.binding === undefined || chart.code !== undefined)) throw new ChartCommandError('invalid_input');
  }
  if (receipt.binding !== undefined) validateBinding(receipt.binding);
  if (receipt.state === 'applied' && (receipt.binding === undefined || receipt.charts.some(chart => record(chart).state !== 'applied'))) throw new ChartCommandError('invalid_input');
  return structuredClone(receipt) as unknown as WorkspaceReceipt;
}
