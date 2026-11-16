import type { AutomationEvent, AutomationHost } from './contracts.js';

type Listener = (event: AutomationEvent) => void;

/**
 * Owns subscription cleanup and coalesces committed data notifications.
 *
 * Data events are coalesced within a microtask. Selection and disposal are
 * immediate and discard a queued data event, which belongs to the previous
 * target. Other events are immediate but first flush queued data so committed
 * order is preserved.
 */
export function createAutomationEvents(assertLive: () => void, onDisposed: () => void) {
  const listeners = new Set<Listener>();
  let disposed = false;
  let queuedData: AutomationEvent | undefined;
  let unsubscribe: (() => void) | undefined;

  const release = () => {
    const current = unsubscribe;
    unsubscribe = undefined;
    current?.();
  };
  const publish = (event: AutomationEvent) => {
    if (disposed) return;
    const copy = Object.freeze({ ...event, target: Object.freeze({ ...event.target }) });
    for (const listener of [...listeners]) {
      if (disposed) break;
      if (!listeners.has(listener)) continue;
      try { listener(copy); } catch { /* Consumer owns its listener errors. */ }
    }
  };
  const takeQueuedData = () => {
    const latest = queuedData;
    queuedData = undefined;
    return latest;
  };
  const flushQueuedData = () => {
    const latest = takeQueuedData();
    if (latest) publish(latest);
  };
  const queueData = (event: AutomationEvent) => {
    const scheduled = queuedData !== undefined;
    queuedData = { ...event, target: { ...event.target } };
    if (!scheduled) queueMicrotask(flushQueuedData);
  };
  const receive = (event: AutomationEvent) => {
    if (disposed) return;
    if (event.type === 'data') {
      queueData(event);
      return;
    }
    if (event.type === 'selection' || event.type === 'disposed') takeQueuedData();
    else flushQueuedData();
    publish(event);
    if (event.type === 'disposed') onDisposed();
  };

  return {
    start(host: AutomationHost) {
      unsubscribe = host.subscribe?.(receive);
      // A host may synchronously dispose during subscription setup.
      if (disposed) release();
    },
    subscribe(listener: Listener) {
      assertLive();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      queuedData = undefined;
      listeners.clear();
      release();
    },
  };
}
