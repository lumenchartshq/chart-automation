import { expect, it, vi } from 'vitest';
import { createChartAutomation, type AutomationEvent } from '../src/sdk/index.js';

const target = { id: 'chart', generation: 0 };
function setup() {
  let emit!: (event: AutomationEvent) => void;
  const sdk = createChartAutomation({ currentTarget: () => target, subscribe(listener) { emit = listener; return () => {}; } });
  const received: string[] = [];
  sdk.events.subscribe(event => received.push(`${event.type}:${event.revision}`));
  return { sdk, received, emit: (type: AutomationEvent['type'], revision: string) => emit({ type, target, revision }) };
}

it('flushes queued data before a later study-ready event', async () => {
  const { sdk, received, emit } = setup();
  emit('data', '1');
  emit('data', '2');
  emit('study-ready', '3');
  expect(received).toEqual(['data:2', 'study-ready:3']);
  await Promise.resolve();
  expect(received).toEqual(['data:2', 'study-ready:3']);
  sdk.destroy();
});

it('discards queued data for the previous target on selection', async () => {
  const { sdk, received, emit } = setup();
  emit('data', '1');
  emit('selection', '2');
  emit('data', '3');
  await Promise.resolve();
  expect(received).toEqual(['selection:2', 'data:3']);
  sdk.destroy();
});

it('delivers selection immediately and only once to a listener removed during delivery', () => {
  const { sdk, emit } = setup();
  const listener = vi.fn();
  const unsubscribe = sdk.events.subscribe(listener);
  sdk.events.subscribe(() => unsubscribe());
  emit('selection', '1');
  emit('selection', '2');
  expect(listener).toHaveBeenCalledOnce();
  sdk.destroy();
});
