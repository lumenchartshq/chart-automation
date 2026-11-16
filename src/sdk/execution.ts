import { ChartCommandError } from '../core-contracts/index.js';
import type { AutomationContext, AutomationHost, AutomationLimits, AutomationPolicy, AutomationRequest, AutomationTarget } from './contracts.js';

export const AUTOMATION_CEILINGS = Object.freeze({
  maxConcurrent: 32,
  deadlineMs: 120_000,
  messageBytes: 2 * 1024 * 1024,
  rows: 10_000,
  series: 256,
  fieldsPerSeries: 128,
  imageBytes: 16 * 1024 * 1024,
  imageDimension: 4096,
});
const DEFAULT_LIMITS: AutomationLimits = { maxConcurrent: 8, deadlineMs: 30_000, messageBytes: 256 * 1024 };
const MAX_ID_LENGTH = 256;

export function automationLimits(policy: AutomationPolicy): AutomationLimits {
  const values: AutomationLimits = {
    maxConcurrent: policy.maxConcurrent ?? DEFAULT_LIMITS.maxConcurrent,
    deadlineMs: policy.deadlineMs ?? DEFAULT_LIMITS.deadlineMs,
    messageBytes: policy.messageBytes ?? DEFAULT_LIMITS.messageBytes,
  };
  for (const key of ['maxConcurrent', 'deadlineMs', 'messageBytes'] as const) {
    const value = values[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > AUTOMATION_CEILINGS[key]) throw new ChartCommandError('invalid_input');
  }
  return Object.freeze(values);
}

export function assertMessage(value: unknown, limit: number): void {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); } catch { throw new ChartCommandError('invalid_input'); }
  if (encoded === undefined) throw new ChartCommandError('invalid_input');
  if (new TextEncoder().encode(encoded).byteLength > limit) throw new ChartCommandError('limit_exceeded');
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

const isBoundedId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;

function assertRequestShape(request: AutomationRequest): void {
  if (!request || typeof request !== 'object' || !request.target || typeof request.target !== 'object') throw new ChartCommandError('invalid_input');
  if (!isBoundedId(request.requestId)) throw new ChartCommandError('invalid_input');
  if (!isBoundedId(request.target.id)) throw new ChartCommandError('invalid_input');
  if (!Number.isSafeInteger(request.target.generation) || request.target.generation < 0) throw new ChartCommandError('invalid_input');
  if (request.deadline !== undefined && !Number.isFinite(request.deadline)) throw new ChartCommandError('invalid_input');
}

/** Detached copy so caller mutation after dispatch cannot change the fence. */
function snapshotRequest(request: AutomationRequest): AutomationRequest {
  return { ...request, target: { ...request.target } };
}

interface Task {
  owner: object;
  controller: AbortController;
  /** Rejects with `expired` or `cancelled` once aborted. */
  cancellation: Promise<never>;
  context(request: AutomationRequest): AutomationContext;
  throwIfAborted(): void;
  dispose(): void;
}

/** One request's abort controller, deadline timer and caller-signal forwarding. */
function createTask(owner: object, callerSignal: AbortSignal | undefined, deadline: number): Task {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const abortError = () => new ChartCommandError(timedOut ? 'expired' : 'cancelled');
  const timer = setTimeout(() => { timedOut = true; abort(); }, deadline - Date.now());
  callerSignal?.addEventListener('abort', abort, { once: true });
  let rejectOnAbort = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(abortError());
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
  });
  return {
    owner,
    controller,
    cancellation,
    context: request => ({ ...snapshotRequest(request), deadline, signal: controller.signal }),
    throwIfAborted() { if (controller.signal.aborted) throw abortError(); },
    dispose() {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', rejectOnAbort);
      callerSignal?.removeEventListener('abort', abort);
    },
  };
}

export interface ExecutionOwner {
  /** Throws `unavailable` after destruction and `stale_binding` unless `target` is current. */
  assertCurrent(target: AutomationTarget): void;
  /** Aborts every active request started for `owner`. */
  cancel(owner: object): void;
  destroy(): void;
  /** Runs bounded work fenced against the request's target before dispatch and before publishing. */
  run<T>(owner: object, request: AutomationRequest, execute: (context: AutomationContext) => Promise<T> | T): Promise<T>;
  /**
   * For declared synchronous navigation commits: `execute` must return synchronously,
   * and the target observed right after it becomes the fence for the result.
   */
  runTargetChange<T>(owner: object, request: AutomationRequest, execute: (context: AutomationContext) => T): Promise<T>;
}

export function createExecutionOwner(host: AutomationHost, limits: AutomationLimits): ExecutionOwner {
  const active = new Map<string, Task>();
  let disposed = false;

  const assertCurrent = (target: AutomationTarget) => {
    if (disposed) throw new ChartCommandError('unavailable');
    const current = host.currentTarget();
    if (current.id !== target.id || current.generation !== target.generation) throw new ChartCommandError('stale_binding');
  };

  const admit = (owner: object, request: AutomationRequest): Task => {
    if (disposed) throw new ChartCommandError('unavailable');
    assertCurrent(request.target);
    if (request.signal?.aborted) throw new ChartCommandError('cancelled');
    if (active.has(request.requestId)) throw new ChartCommandError('operation_conflict');
    if (active.size >= limits.maxConcurrent) throw new ChartCommandError('busy');
    const deadline = Math.min(request.deadline ?? Infinity, Date.now() + limits.deadlineMs);
    if (deadline <= Date.now()) throw new ChartCommandError('expired');
    const task = createTask(owner, request.signal, deadline);
    active.set(request.requestId, task);
    return task;
  };

  /** Starts `execute` on a later microtask after rechecking cancellation and the target. */
  const dispatch = <T>(task: Task, request: AutomationRequest, execute: (context: AutomationContext) => T) =>
    Promise.resolve().then(() => {
      task.throwIfAborted();
      assertCurrent(request.target);
      return execute(task.context(request));
    });

  const settle = async <T>(task: Task, requestId: string, work: Promise<T>, fence: () => AutomationTarget): Promise<T> => {
    try {
      const result = await Promise.race([work, task.cancellation]);
      task.throwIfAborted();
      assertCurrent(fence());
      return result;
    } finally {
      task.dispose();
      // A deadline cannot forcibly stop a host handler. Keep its concurrency
      // slot until the actual work settles, so repeated timeouts stay bounded.
      const release = () => { if (active.get(requestId) === task) active.delete(requestId); };
      void work.then(release, release);
    }
  };

  return {
    assertCurrent,
    cancel(owner) {
      for (const task of active.values()) if (task.owner === owner) task.controller.abort();
    },
    destroy() {
      disposed = true;
      for (const task of active.values()) task.controller.abort();
    },
    async run(owner, request, execute) {
      assertRequestShape(request);
      const snapshot = snapshotRequest(request);
      const task = admit(owner, snapshot);
      const work = dispatch(task, snapshot, execute);
      return settle(task, snapshot.requestId, work, () => snapshot.target);
    },
    async runTargetChange(owner, request, execute) {
      assertRequestShape(request);
      const snapshot = snapshotRequest(request);
      const task = admit(owner, snapshot);
      let fence = snapshot.target;
      const work = dispatch(task, snapshot, context => {
        const result = execute(context);
        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch(() => {});
          throw new ChartCommandError('invalid_input', 'Target-changing commands must complete synchronously');
        }
        fence = { ...host.currentTarget() };
        return result;
      });
      return settle(task, snapshot.requestId, work, () => fence);
    },
  };
}
