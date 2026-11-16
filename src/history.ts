import { ChartCommandError } from './contracts.js';

export const CHART_HISTORY_VERSION = 1 as const;
export const HISTORY_LIMITS = { events: 50, ledgerBytes: 512 * 1024, pageSize: 50, readEntriesPerTurn: 200, provenanceEntries: 2000, changeBytes: 32 * 1024 } as const;
export type HistoryOrigin = 'user' | 'ai' | 'system' | 'unknown';
export type HistoryFamily = 'drawings' | 'studies' | 'workspace';
export type { NativeHistoryDomain, HistoryEntityDelta, NativeHistoryEntry } from "./core-contracts/index.js";
export interface HistoryRevisionVector { drawing: number; study: number; workspace: number }
export interface ChartHistoryChange {
  entityId: string;
  action: 'create' | 'update' | 'delete';
  fields: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  omitted?: boolean;
}
export interface ChartHistoryEvent {
  sequence: number;
  timestamp: number;
  operationId: string;
  family: HistoryFamily;
  chartId: string;
  documentId: string;
  origin: HistoryOrigin;
  beforeRevision: number;
  afterRevision: number;
  summary: string;
  changes: ChartHistoryChange[];
  omittedChanges: number;
  turnId?: string;
  toolCallId?: string;
}
export interface ChartEntityProvenance {
  chartId: string;
  family: HistoryFamily;
  entityId: string;
  createdBy: HistoryOrigin;
  lastEditedBy: HistoryOrigin;
  firstSequence: number | null;
  lastSequence: number;
  deleted: boolean;
}
export interface ChartHistoryRead { chartId?: string; entityId?: string; beforeSequence?: number; limit: number }
export interface ChartHistoryPage {
  version: 1;
  revisions: Array<{ chartId: string; documentId: string; documents: HistoryRevisionVector }>;
  events: ChartHistoryEvent[];
  provenance: ChartEntityProvenance[];
  nextCursor: number | null;
  retainedFrom: number;
  historyComplete: boolean;
  omittedCount: number;
}
export interface ChartHistoryReadPort { read(input: ChartHistoryRead, signal?: AbortSignal): Promise<ChartHistoryPage> }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null) {
    const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
    // Public widget values cross an iframe realm; its native Object prototype differs.
    if (typeof constructor !== 'function' || constructor.prototype !== prototype || Function.prototype.toString.call(constructor) !== Function.prototype.toString.call(Object)) throw new ChartCommandError('invalid_input');
  }
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ChartCommandError('invalid_input');
}
function text(value: unknown, max = 256): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > max) throw new ChartCommandError('invalid_input');
}
function integer(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ChartCommandError('invalid_input');
}
export function historyBytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export function validateHistoryRevisionVector(value: unknown): HistoryRevisionVector {
  const vector = record(value); exact(vector, ['drawing', 'study', 'workspace']);
  integer(vector.drawing); integer(vector.study); integer(vector.workspace);
  return { drawing: vector.drawing, study: vector.study, workspace: vector.workspace };
}
export function validateChartHistoryRead(value: unknown): ChartHistoryRead {
  const input = record(value); exact(input, ['chartId', 'entityId', 'beforeSequence', 'limit']);
  if (input.chartId !== undefined) text(input.chartId);
  if (input.entityId !== undefined) text(input.entityId);
  if (input.beforeSequence !== undefined) { integer(input.beforeSequence); if (!input.beforeSequence) throw new ChartCommandError('invalid_input'); }
  const limit = input.limit ?? HISTORY_LIMITS.pageSize;
  integer(limit); if (!limit || limit > HISTORY_LIMITS.pageSize) throw new ChartCommandError('limit_exceeded');
  return { ...input, limit } as ChartHistoryRead;
}
