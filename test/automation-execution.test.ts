import { afterEach, expect, it, vi } from 'vitest';
import { automationLimits, createExecutionOwner } from '../src/sdk/execution.js';
import type { AutomationTarget } from '../src/sdk/contracts.js';

let target: AutomationTarget = { id: 'chart', generation: 0 };
const owner = {};
const request = (requestId = 'r1', extra: Record<string, unknown> = {}) => ({ requestId, target: { id: 'chart', generation: 0 }, ...extra });
const setup = (policy = {}) => createExecutionOwner({ currentTarget: () => target }, automationLimits(policy));

afterEach(() => {
  target = { id: 'chart', generation: 0 };
  vi.useRealTimers();
});

it('rejects requests that are already cancelled or past their deadline', async () => {
  const execution = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(execution.run(owner, request('a', { signal: controller.signal }), () => 1)).rejects.toThrow('cancelled');
  await expect(execution.run(owner, request('b', { deadline: Date.now() - 1 }), () => 1)).rejects.toThrow('expired');
  await expect(execution.run(owner, request('c', { deadline: Number.NaN }), () => 1)).rejects.toThrow('invalid_input');
});

it('rejects malformed request identities before dispatch', async () => {
  const execution = setup();
  const execute = vi.fn();
  await expect(execution.run(owner, request(''), execute)).rejects.toThrow('invalid_input');
  await expect(execution.run(owner, { requestId: 'r', target: { id: 'chart', generation: -1 } }, execute)).rejects.toThrow('invalid_input');
  expect(execute).not.toHaveBeenCalled();
});

it('expires at the session ceiling even when the request deadline is later', async () => {
  vi.useFakeTimers();
  const execution = setup({ deadlineMs: 50 });
  const pending = execution.run(owner, request('slow', { deadline: Date.now() + 60_000 }), () => new Promise(() => {}));
  const assertion = expect(pending).rejects.toThrow('expired');
  await vi.advanceTimersByTimeAsync(51);
  await assertion;
});

it('forwards the caller abort to the handler signal', async () => {
  const execution = setup();
  const controller = new AbortController();
  let observed: AbortSignal | undefined;
  const pending = execution.run(owner, request('abort', { signal: controller.signal }), context => {
    observed = context.signal;
    return new Promise(() => {});
  });
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  expect(observed?.aborted).toBe(true);
});

it('releases the request ID once the handler settles, allowing reuse', async () => {
  const execution = setup({ maxConcurrent: 1 });
  expect(await execution.run(owner, request(), () => 1)).toBe(1);
  await Promise.resolve();
  expect(await execution.run(owner, request(), () => 2)).toBe(2);
});

it('cancels only the requests of the given owner', async () => {
  const execution = setup();
  const other = {};
  const cancelled = execution.run(owner, request('mine'), () => new Promise(() => {}));
  const kept = execution.run(other, request('other'), () => new Promise(resolve => setTimeout(() => resolve('done'), 0)));
  await Promise.resolve();
  execution.cancel(owner);
  await expect(cancelled).rejects.toThrow('cancelled');
  await expect(kept).resolves.toBe('done');
});

it('rejects work after destruction and cancels active work', async () => {
  const execution = setup();
  const pending = execution.run(owner, request('active'), () => new Promise(() => {}));
  await Promise.resolve();
  execution.destroy();
  await expect(pending).rejects.toThrow('cancelled');
  await expect(execution.run(owner, request('late'), () => 1)).rejects.toThrow('unavailable');
});

it('fences a target-changing commit against the target observed after it', async () => {
  const execution = setup();
  const result = execution.runTargetChange(owner, request(), () => {
    target = { id: 'chart', generation: 1 };
    return 'committed';
  });
  await expect(result).resolves.toBe('committed');
});

it('rejects an asynchronous target-changing handler', async () => {
  const execution = setup();
  await expect(execution.runTargetChange(owner, request(), () => Promise.resolve('late'))).rejects.toThrow('must complete synchronously');
});

it('rejects a result published after an unexpected target change', async () => {
  const execution = setup();
  const pending = execution.run(owner, request(), async () => {
    target = { id: 'chart', generation: 1 };
    return 'stale';
  });
  await expect(pending).rejects.toThrow('stale_binding');
});
