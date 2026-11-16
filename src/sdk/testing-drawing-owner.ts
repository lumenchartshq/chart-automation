import { ChartCommandError, sameBinding, validateDocument, type ChartBar, type ChartBinding, type DrawingDocument } from '../core-contracts/index.js';
import {
  DRAWING_TYPES, validateBatch,
  type ChartContext, type ChartDrawingApi, type DrawingBatch, type DrawingReceipt, type DrawingSummary, type PreparedDrawingBatch,
} from '../contracts.js';

export interface FakeDrawingOwnerOptions {
  binding?: Partial<ChartBinding>;
  /** Drawings present before the first change. */
  drawings?: DrawingSummary[];
  /** Bars returned by `readBars`, ordered by time (UTC milliseconds). */
  bars?: ChartBar[];
}

/** An in-memory `ChartDrawingApi` with the native owner's prepare/lease/commit, receipt and Undo rules. */
export interface FakeDrawingOwner extends ChartDrawingApi {
  binding(): ChartBinding;
  /** True while a mutation lease is held, which is when a real chart blocks manual edits. */
  leased(): boolean;
  /** A committed edit outside any SDK request, like a user drawing by hand. It joins the Undo history. */
  manualEdit(operationId: string, change: (drawings: DrawingSummary[]) => DrawingSummary[]): void;
}

const TEST_BINDING: ChartBinding = { documentId: 'test-document', instanceId: 'test-instance', epoch: 1, symbol: { ticker: 'TEST' }, interval: '1D', revision: 0 };

interface Candidate { prepared: PreparedDrawingBatch; payload: string; revision: number }

/**
 * A fake drawing owner for unit tests: create, update and delete operations on
 * plain drawing summaries, with the native contract's stale-binding, conflict,
 * replay and lease behavior. Group operations reject with `unsupported`.
 */
export function createFakeDrawingOwner(options: FakeDrawingOwnerOptions = {}): FakeDrawingOwner {
  const initial: ChartBinding = { ...TEST_BINDING, ...options.binding, symbol: { ...TEST_BINDING.symbol, ...options.binding?.symbol } };
  let drawings = structuredClone(options.drawings ?? []);
  let revision = initial.revision;
  let epoch = initial.epoch;
  const leases = new Set<number>();
  let leaseSequence = 0;
  let destroyed = false;
  const candidates = new Map<string, Candidate>();
  const receipts = new Map<string, { payload: string; receipt: DrawingReceipt }>();
  const history: { operationId: string; before: DrawingSummary[] }[] = [];
  const listeners = new Set<() => void>();
  const bars = options.bars ?? [];

  const check = () => { if (destroyed) throw new ChartCommandError('unavailable'); };
  /** Manual-edit paths; a held mutation lease blocks them as it blocks the user on a real chart. */
  const idle = () => { check(); if (leases.size) throw new ChartCommandError('busy'); };
  const binding = (): ChartBinding => ({ ...initial, symbol: { ...initial.symbol }, epoch, revision });
  const notify = () => { for (const listener of [...listeners]) listener(); };
  const documentOf = (entries: DrawingSummary[], at: number): DrawingDocument =>
    ({ version: 1, documentId: initial.documentId, revision: at, payload: { drawings: structuredClone(entries) } });
  /** Applies a committed state: bumps the revision and drops every open preparation. */
  const replace = (next: DrawingSummary[], at = revision + 1) => {
    drawings = next;
    revision = at;
    candidates.clear();
    notify();
  };

  function applyOperations(batch: DrawingBatch): { next: DrawingSummary[]; ids: string[] } {
    const next = structuredClone(drawings);
    const ids: string[] = [];
    for (const [index, operation] of batch.operations.entries()) {
      if (operation.action === 'create') {
        const id = `drawing-${batch.operationId}-${index}`;
        next.push({
          id, type: operation.type, points: structuredClone(operation.points), locked: false, selected: false, editable: true,
          ...(operation.style?.text !== undefined ? { text: operation.style.text } : {}),
          ...(operation.style?.color !== undefined ? { color: operation.style.color } : {}),
        });
        ids.push(id);
        continue;
      }
      if (operation.action !== 'update' && operation.action !== 'delete') throw new ChartCommandError('unsupported');
      const at = next.findIndex(entry => entry.id === operation.id);
      if (at < 0) throw new ChartCommandError('ambiguous_target');
      if (next[at]!.locked && operation.unlock !== true) throw new ChartCommandError('locked');
      ids.push(operation.id);
      if (operation.action === 'delete') {
        next.splice(at, 1);
        continue;
      }
      const entry = next[at]!;
      if (operation.points) entry.points = structuredClone(operation.points);
      if (operation.style?.text !== undefined) entry.text = operation.style.text;
      if (operation.style?.color !== undefined) entry.color = operation.style.color;
      if (operation.unlock) entry.locked = false;
    }
    return { next, ids };
  }

  return {
    binding,
    leased: () => leases.size > 0,
    invalidatePreparations() {
      epoch++;
      candidates.clear();
    },
    context(): ChartContext {
      check();
      return { version: 1, binding: binding(), types: DRAWING_TYPES, visibleRange: null, selectedIds: [], snapshotId: `fake-${revision}` };
    },
    readBars({ from, to }) {
      check();
      const first = bars[0]?.time ?? null;
      const last = bars.at(-1)?.time ?? null;
      return {
        bars: bars.filter(bar => bar.time >= from && bar.time <= to),
        coverage: { from: first, to: last, complete: first !== null && last !== null && first <= from && last >= to },
      };
    },
    list({ offset, limit }) {
      check();
      return { drawings: structuredClone(drawings.slice(offset, offset + limit)), total: drawings.length };
    },
    prepare(raw) {
      check();
      const batch = validateBatch(raw);
      const payload = JSON.stringify(batch);
      const previous = candidates.get(batch.operationId);
      const receipt = receipts.get(batch.operationId);
      if ((previous && previous.payload !== payload) || receipt) throw new ChartCommandError('operation_conflict');
      if (previous) return structuredClone(previous.prepared);
      if (!sameBinding(batch.binding, binding())) throw new ChartCommandError('stale_binding');
      const { next, ids } = applyOperations(batch);
      const prepared: PreparedDrawingBatch = { operationId: batch.operationId, binding: batch.binding, document: documentOf(next, revision + 1), ids };
      candidates.set(batch.operationId, { prepared, payload, revision });
      return structuredClone(prepared);
    },
    acquireMutationLease(operationId) {
      check();
      if (!candidates.has(operationId)) throw new ChartCommandError('stale_binding');
      const token = ++leaseSequence;
      leases.add(token);
      return () => { leases.delete(token); };
    },
    commit(operationId) {
      check();
      const done = receipts.get(operationId);
      if (done) return structuredClone(done.receipt);
      const candidate = candidates.get(operationId);
      if (!candidate) throw new ChartCommandError('stale_binding');
      if (candidate.revision !== revision || !sameBinding(candidate.prepared.binding, binding())) {
        candidates.delete(operationId);
        throw new ChartCommandError('stale_binding');
      }
      history.push({ operationId, before: drawings });
      replace(structuredClone(candidate.prepared.document.payload.drawings) as DrawingSummary[], candidate.prepared.document.revision);
      const receipt: DrawingReceipt = { operationId, state: 'applied', revision, ids: [...candidate.prepared.ids] };
      receipts.set(operationId, { payload: candidate.payload, receipt });
      return structuredClone(receipt);
    },
    discard(operationId) {
      candidates.delete(operationId);
    },
    updatePersistenceRevision(value) {
      check();
      if (!Number.isSafeInteger(value) || value < 0) throw new ChartCommandError('invalid_input');
      revision = value;
      candidates.clear();
    },
    exportDocument() {
      check();
      return documentOf(drawings, revision);
    },
    restoreDocument(raw) {
      idle();
      const document = validateDocument(raw);
      if (document.documentId !== initial.documentId) throw new ChartCommandError('stale_binding');
      const restored = document.payload.drawings;
      if (!Array.isArray(restored)) throw new ChartCommandError('invalid_input');
      history.length = 0;
      replace(structuredClone(restored) as DrawingSummary[], document.revision);
    },
    resetDocument() {
      this.restoreDocument(documentOf([], 0));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isNextUndo: operationId => !destroyed && history.at(-1)?.operationId === operationId,
    undo(operationId) {
      idle();
      if (history.at(-1)?.operationId !== operationId) return false;
      replace(history.pop()!.before);
      return true;
    },
    manualEdit(operationId, change) {
      idle();
      history.push({ operationId, before: drawings });
      replace(change(structuredClone(drawings)));
    },
    destroy() {
      destroyed = true;
      candidates.clear();
      receipts.clear();
      listeners.clear();
      history.length = 0;
    },
  };
}
