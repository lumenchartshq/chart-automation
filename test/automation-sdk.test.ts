import { describe, it, expect, vi } from 'vitest';
import { createChartAutomation, type AutomationCommand, type AutomationHost, type AutomationTarget } from '../src/sdk/index.js';
const schema = { jsonSchema: { type: 'number' }, parse(value: unknown) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid number'); return value; } };
const command = (execute: AutomationCommand<number, number>['execute']): AutomationCommand<number, number> => ({ name: 'example.double', version: 1, description: 'Double a number', effect: 'read', input: schema, output: schema, execute });
const request = () => ({ requestId: 'r1', target: { id: 'chart', generation: 1 } });
const host = (): AutomationHost => ({ currentTarget: () => request().target });

describe('standalone automation SDK', () => {
  it('runs without conversation IDs, uploads, AI or application services', async () => {
    const sdk = createChartAutomation(host());
    sdk.extensions.register(command(n => n * 2));
    expect(await sdk.execute('example.double', 3, request())).toBe(6);
    expect(sdk.capabilities().commands[0]?.input).toEqual({ type: 'number' });
    sdk.destroy();
  });
  it('fills an omitted request with a fresh ID and the current target', async () => {
    let target: AutomationTarget = request().target;
    const sdk = createChartAutomation({ currentTarget: () => target });
    const seen: string[] = [];
    const registration = sdk.extensions.register(command((n, context) => { seen.push(context.requestId); return n * 2; }));
    expect(await Promise.all([sdk.execute('example.double', 1), registration.execute(2)])).toEqual([2, 4]);
    expect(new Set(seen).size).toBe(2);
    target = { id: 'chart', generation: 4 };
    expect(sdk.target()).toEqual(target);
    expect(sdk.request({ requestId: 'mine' })).toEqual({ requestId: 'mine', target });
    expect(await sdk.execute('example.double', 5)).toBe(10);
    sdk.close();
    expect(() => sdk.capabilities()).toThrow('unavailable');
  });
  it('negotiates read-only access and rejects mutation tools', async () => {
    const sdk = createChartAutomation(host(), { effects: ['read'] });
    sdk.extensions.register({ ...command(n => n), effect: 'mutation' });
    expect(sdk.capabilities().commands).toEqual([]);
    await expect(sdk.execute('example.double', 3, request())).rejects.toThrow('unsupported');
    sdk.destroy();
  });
  it('rejects duplicates, reserved names, invalid input and output', async () => {
    const sdk = createChartAutomation(host());
    sdk.extensions.register(command(() => 'bad' as unknown as number));
    expect(() => sdk.extensions.register(command(n => n))).toThrow('operation_conflict');
    expect(() => sdk.extensions.register({ ...command(n => n), name: 'data.override' })).toThrow('invalid_input');
    await expect(sdk.execute('example.double', {}, request())).rejects.toThrow('invalid number');
    // An invalid result is a handler bug: it is not reported as the caller's input.
    await expect(sdk.execute('example.double', 3, request())).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'invalid result' } });
    sdk.destroy();
  });
  it('cancels unregistering work and ignores its eventual completion', async () => {
    const sdk = createChartAutomation(host());
    let finish!: (n: number) => void;
    const dispose = vi.fn();
    const unregister = sdk.extensions.register({ ...command(() => new Promise(resolve => { finish = resolve; })), dispose });
    const pending = sdk.execute('example.double', 1, request());
    await Promise.resolve();
    unregister();
    await expect(pending).rejects.toThrow('cancelled');
    finish(2); unregister(); sdk.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('rejects stale results including an A-B-A generation change', async () => {
    let target: AutomationTarget = request().target;
    const sdk = createChartAutomation({ currentTarget: () => target });
    sdk.extensions.register(command(async n => { target = { ...target, generation: 3 }; return n; }));
    await expect(sdk.execute('example.double', 1, request())).rejects.toThrow('stale_binding');
    sdk.destroy();
  });
  it('bounds concurrent execution and rejects duplicate in-flight IDs', async () => {
    const sdk = createChartAutomation(host(), { maxConcurrent: 1 });
    sdk.extensions.register(command(() => new Promise(() => {})));
    const pending = sdk.execute('example.double', 1, request());
    await expect(sdk.execute('example.double', 2, request())).rejects.toThrow('operation_conflict');
    await expect(sdk.execute('example.double', 2, { ...request(), requestId: 'r2' })).rejects.toThrow('busy');
    sdk.destroy(); await expect(pending).rejects.toThrow('cancelled');
  });
  it('continues disposal after a failing extension', () => {
    const sdk = createChartAutomation(host()); const last = vi.fn();
    sdk.extensions.register({ ...command(n => n), dispose() { throw new Error('first'); } });
    sdk.extensions.register({ ...command(n => n), name: 'another.double', dispose: last });
    expect(() => sdk.destroy()).toThrow('first'); expect(last).toHaveBeenCalledOnce(); sdk.destroy();
  });
  it('exposes loaded data independently of mutation commands and validates coverage', async () => {
    const sdk = createChartAutomation({ ...host(), data: {
      series: () => [{ id: 'main', kind: 'main', fields: ['open', 'high', 'low', 'close'].map(name => ({ name, type: 'number' as const })), timeUnit: 'milliseconds', readiness: 'ready' }],
      read: () => ({ seriesId: 'main', revision: '1', rows: [{ time: 1, open: 2, high: 2, low: 2, close: 2 }], coverage: { from: 1, to: 1, complete: false } }),
    } }, { effects: ['read'] });
    expect((await sdk.data.read({ seriesId: 'main', from: 0, to: 2, limit: 1 }, request())).coverage.complete).toBe(false);
    await expect(sdk.data.read({ seriesId: 'missing', from: 0, to: 2, limit: 1 }, request())).rejects.toThrow('unsupported');
    await expect(sdk.data.requestHistory({ seriesId: 'main', from: 0, to: 2, limit: 1 }, request())).rejects.toThrow('unsupported');
    sdk.destroy();
  });
});

it('expires a non-cooperating handler and fences late results', async () => {
  vi.useFakeTimers();
  const sdk = createChartAutomation(host(), { deadlineMs: 10 });
  sdk.extensions.register(command(() => new Promise(() => {})));
  const pending = sdk.execute('example.double', 1, request());
  const assertion = expect(pending).rejects.toThrow('expired');
  await vi.advanceTimersByTimeAsync(11);
  await assertion; sdk.destroy(); vi.useRealTimers();
});

it('captures a local Blob without attachment storage', async () => {
  const sdk = createChartAutomation({ ...host(), capture: { async image() {
    return { blob: new Blob(['png'], { type: 'image/png' }), width: 100, height: 100, target: request().target, capturedAt: new Date().toISOString(), revision: 'r1', visibleRange: null };
  } } });
  const capture = await sdk.capture.image(request());
  expect(capture.blob.type).toBe('image/png');
  expect('attachmentId' in capture).toBe(false);
  sdk.destroy();
});

it('rejects false complete coverage and unordered outputs from host data adapters', async () => {
  const sdk = createChartAutomation({ ...host(), data: {
    series: () => [{ id: 'custom', kind: 'study', fields: [{ name: 'value', type: 'number' }], timeUnit: 'milliseconds', readiness: 'ready' }],
    read: () => ({ seriesId: 'custom', revision: 'r1', rows: [], coverage: { from: null, to: null, complete: true } }),
  } });
  await expect(sdk.data.read({ seriesId: 'custom', from: 1, to: 2, limit: 10 }, request())).rejects.toThrow('invalid_input');
  sdk.destroy();
});

it('delegates explicit history requests and validates the returned data', async () => {
  const history = vi.fn(async () => ({ seriesId: 'main', revision: 'r1', rows: [], coverage: { from: null, to: null, complete: false } }));
  const sdk = createChartAutomation({ ...host(), data: {
    series: () => [{ id: 'main', kind: 'main', fields: ['open', 'high', 'low', 'close'].map(name => ({ name, type: 'number' as const })), timeUnit: 'milliseconds', readiness: 'ready' }],
    read: history, requestHistory: history,
  } });
  await sdk.data.requestHistory({ seriesId: 'main', from: 1, to: 2, limit: 10 }, request());
  expect(history).toHaveBeenCalledOnce();
  expect(history.mock.calls[0]?.length).toBe(2);
  sdk.destroy();
});

it('does not expose mutable schema or policy configuration', async () => {
  const effects: ('read' | 'mutation')[] = ['read'];
  const sdk = createChartAutomation(host(), { effects });
  sdk.extensions.register(command(n => n));
  const capabilities = sdk.capabilities();
  (capabilities.commands[0]!.input as Record<string, unknown>).type = 'string';
  effects.push('mutation');
  expect(sdk.capabilities().commands[0]!.input.type).toBe('number');
  sdk.destroy();
});

it('rechecks target immediately before dispatch, not just before scheduling', async () => {
  let target = request().target;
  const execute = vi.fn((n: number) => n);
  const sdk = createChartAutomation({ currentTarget: () => target });
  sdk.extensions.register(command(execute));
  const pending = sdk.execute('example.double', 1, request());
  target = { ...target, generation: 2 };
  await expect(pending).rejects.toThrow('stale_binding');
  expect(execute).not.toHaveBeenCalled(); sdk.destroy();
});

it('coalesces data events and never delivers them after disposal', async () => {
  let emit!: (event: import('../src/sdk/contracts.js').AutomationEvent) => void;
  const unsubscribe = vi.fn();
  const sdk = createChartAutomation({ ...host(), subscribe(listener) { emit = listener; return unsubscribe; } });
  const listener = vi.fn(); sdk.events.subscribe(listener);
  emit({ type: 'data', target: request().target, revision: '1' });
  emit({ type: 'data', target: request().target, revision: '2' });
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener.mock.calls[0]?.[0].revision).toBe('2');
  emit({ type: 'data', target: request().target, revision: '3' }); sdk.destroy();
  await Promise.resolve(); expect(listener).toHaveBeenCalledTimes(1); expect(unsubscribe).toHaveBeenCalledOnce();
});

it('registration snapshots its identity and a removed typed handle cannot invoke a replacement', async () => {
  const sdk = createChartAutomation(host());
  const definition = command(n => n * 2);
  const handle = sdk.extensions.register(definition);
  definition.name = 'changed.name';
  expect(await handle.execute(2, request())).toBe(4);
  handle();
  expect(sdk.capabilities().commands).toEqual([]);
  sdk.extensions.register(command(n => n * 3));
  await expect(handle.execute(2, request())).rejects.toThrow('unsupported');
  sdk.destroy();
});

it('returns a receipt for an explicitly declared synchronous navigation commit', async () => {
  let target = request().target;
  const sdk = createChartAutomation({ currentTarget: () => target });
  sdk.extensions.register({ ...command(n => { target = { ...target, generation: 2 }; return n; }), effect: 'mutation', targetChange: 'synchronous' });
  expect(await sdk.execute('example.double', 1, request())).toBe(1);
  sdk.destroy();
});

it('holds the concurrency slot until a cancelled host handler actually settles', async () => {
  const sdk = createChartAutomation(host(), { maxConcurrent: 1 });
  let finish!: (value: number) => void;
  sdk.extensions.register(command(() => new Promise(resolve => { finish = resolve; })));
  const controller = new AbortController();
  const pending = sdk.execute('example.double', 1, { ...request(), signal: controller.signal });
  await Promise.resolve(); controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  await expect(sdk.execute('example.double', 1, { ...request(), requestId: 'second' })).rejects.toThrow('busy');
  finish(1); await Promise.resolve(); await Promise.resolve(); sdk.destroy();
});

it('rejects stale capture metadata and advertises no capture without a host port', async () => {
  const plain = createChartAutomation(host());
  expect(plain.capabilities().capture).toBe(false); plain.destroy();
  const sdk = createChartAutomation({ ...host(), capture: { async image() {
    return { blob: new Blob(['png'], { type: 'image/png' }), width: 100, height: 100, target: { ...request().target, generation: 2 }, capturedAt: new Date().toISOString(), revision: 'r1', visibleRange: null };
  } } });
  await expect(sdk.capture.image(request())).rejects.toThrow('stale_binding'); sdk.destroy();
});

it('requires host image transport for model capture and uses provider-safe names', async () => {
  const { createAutomationTools } = await import('../src/sdk/model-tools.js');
  const sdk = createChartAutomation(host()); sdk.extensions.register(command(n => n));
  const tools = createAutomationTools(sdk, () => request());
  expect(tools[0]!.name).toBe('example_double');
  expect(await tools[0]!.execute('tool', 3)).toBe(3);
  expect(tools.some(tool => tool.name === 'capture_image')).toBe(false); sdk.destroy();
});

it('bounds local PNG decoding and rejects malformed image headers', async () => {
  const { decodeChartPng } = await import('../src/sdk/capture.js');
  const image = decodeChartPng('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=');
  expect(image.width).toBe(1); expect(image.height).toBe(1); expect(image.blob.type).toBe('image/png');
  expect(() => decodeChartPng('data:image/png;base64,YWJj')).toThrow('invalid_input');
  expect(() => decodeChartPng('https://example.com/chart.png')).toThrow('invalid_input');
});

it('rolls back native subscriptions when a later subscription fails', async () => {
  const { createNativeChartAutomation } = await import('../src/sdk/native-chart.js');
  const unsubscribe = vi.fn();
  const subscription = { subscribe: vi.fn(), unsubscribe };
  const failed = { subscribe() { throw new Error('subscribe failed'); }, unsubscribe };
  expect(() => createNativeChartAutomation({ chartId: 'chart', chart: {
    readLoadedBars: () => ({ bars: [], coverage: { from: null, to: null, complete: false } }),
    dataReady: () => true, getVisibleRange: () => null,
    onSymbolChanged: () => subscription, onIntervalChanged: () => failed,
    onDataChanged: () => subscription, onVisibleRangeChanged: () => subscription, onRemoved: () => () => {},
  } })).toThrow('subscribe failed');
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});

it('stops event publication immediately if a listener destroys the session', () => {
  let emit!: (event: import('../src/sdk/contracts.js').AutomationEvent) => void;
  const sdk = createChartAutomation({ ...host(), subscribe(listener) { emit = listener; return () => {}; } });
  const later = vi.fn();
  sdk.events.subscribe(() => sdk.destroy()); sdk.events.subscribe(later);
  emit({ type: 'selection', target: request().target, revision: '1' });
  expect(later).not.toHaveBeenCalled();
});
it('cleans up a host that reports disposal synchronously while subscribing', () => {
  const unsubscribe = vi.fn();
  const sdk = createChartAutomation({ ...host(), subscribe(listener) {
    listener({ type: 'disposed', target: request().target, revision: '1' });
    return unsubscribe;
  } });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(() => sdk.capabilities()).toThrow('unavailable');
  sdk.destroy(); expect(unsubscribe).toHaveBeenCalledOnce();
});

it('accepts a PNG Blob from the native capture port without base64 decoding', async () => {
  const { createNativeChartAutomation } = await import('../src/sdk/native-chart.js');
  const { readChartPng } = await import('../src/sdk/capture.js');
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=';
  const blob = new Blob([Uint8Array.from(atob(pngBase64), char => char.charCodeAt(0))], { type: 'image/png' });
  const subscription = { subscribe() {}, unsubscribe() {} };
  const sdk = createNativeChartAutomation({ chartId: 'chart', capturePng: async () => blob, chart: {
    readLoadedBars: () => ({ bars: [], coverage: { from: null, to: null, complete: false } }),
    dataReady: () => true, getVisibleRange: () => ({ from: 1, to: 2 }),
    onSymbolChanged: () => subscription, onIntervalChanged: () => subscription,
    onDataChanged: () => subscription, onVisibleRangeChanged: () => subscription, onRemoved: () => () => {},
  } });
  const capture = await sdk.capture.image({ requestId: 'capture', target: sdk.target() });
  expect(capture.blob).toBe(blob);
  expect([capture.width, capture.height]).toEqual([1, 1]);
  expect(capture.visibleRange).toEqual({ from: 1000, to: 2000 });
  await expect(readChartPng(new Blob(['png'], { type: 'image/png' }))).rejects.toThrow('invalid_input');
  await expect(readChartPng(new Blob(['png'], { type: 'text/plain' }))).rejects.toThrow('invalid_input');
  sdk.destroy();
});

it('rejects a capture when the viewport changes and returns to its original range', async () => {
  const { createNativeChartAutomation } = await import('../src/sdk/native-chart.js');
  let onRangeChanged!: () => void;
  let finish!: (image: string) => void;
  const subscription = { subscribe() {}, unsubscribe() {} };
  const rangeSubscription = {
    subscribe(_owner: unknown, listener: () => void) { onRangeChanged = listener; },
    unsubscribe: vi.fn(),
  };
  const sdk = createNativeChartAutomation({ chartId: 'chart', capturePng: () => new Promise(resolve => { finish = resolve; }), chart: {
    readLoadedBars: () => ({ bars: [], coverage: { from: null, to: null, complete: false } }),
    dataReady: () => true, getVisibleRange: () => ({ from: 1, to: 2 }),
    onSymbolChanged: () => subscription, onIntervalChanged: () => subscription,
    onDataChanged: () => subscription, onVisibleRangeChanged: () => rangeSubscription, onRemoved: () => () => {},
  } });
  const pending = sdk.capture.image({ requestId: 'capture', target: sdk.target() });
  await Promise.resolve();
  onRangeChanged(); onRangeChanged();
  finish('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=');
  await expect(pending).rejects.toThrow('stale_binding');
  sdk.destroy();
  expect(rangeSubscription.unsubscribe).toHaveBeenCalledOnce();
});

it('preserves the additional data provider receiver when requesting history', async () => {
  const { createNativeChartAutomation } = await import('../src/sdk/native-chart.js');
  const subscription = { subscribe() {}, unsubscribe() {} };
  const additionalData = {
    revision: 'host-revision',
    series: () => [{ id: 'study', kind: 'study' as const, fields: [{ name: 'value', type: 'number' as const }], timeUnit: 'milliseconds' as const, readiness: 'ready' as const }],
    read: () => { throw new Error('not used'); },
    async requestHistory() {
      return { seriesId: 'study', revision: this.revision, rows: [{ time: 1, value: 2 }], coverage: { from: 1, to: 1, complete: true } };
    },
  };
  const sdk = createNativeChartAutomation({ chartId: 'chart', additionalData, chart: {
    readLoadedBars: () => ({ bars: [], coverage: { from: null, to: null, complete: false } }),
    dataReady: () => true, getVisibleRange: () => null,
    onSymbolChanged: () => subscription, onIntervalChanged: () => subscription,
    onDataChanged: () => subscription, onVisibleRangeChanged: () => subscription, onRemoved: () => () => {},
  } });
  const result = await sdk.data.requestHistory({ seriesId: 'study', from: 1, to: 1, limit: 1 }, { requestId: 'history', target: sdk.target() });
  expect(result.revision).toBe('host-revision');
  sdk.destroy();
});

it('supports a native port without visible-range notifications, falling back to range comparison', async () => {
  const { createNativeChartAutomation } = await import('../src/sdk/native-chart.js');
  let range = { from: 1, to: 2 };
  let finish!: (image: string) => void;
  const subscription = { subscribe() {}, unsubscribe() {} };
  const sdk = createNativeChartAutomation({ chartId: 'chart', capturePng: () => new Promise(resolve => { finish = resolve; }), chart: {
    readLoadedBars: () => ({ bars: [], coverage: { from: null, to: null, complete: false } }),
    dataReady: () => true, getVisibleRange: () => range,
    onSymbolChanged: () => subscription, onIntervalChanged: () => subscription,
    onDataChanged: () => subscription, onRemoved: () => () => {},
  } });
  const pending = sdk.capture.image({ requestId: 'capture', target: sdk.target() });
  await Promise.resolve();
  range = { from: 3, to: 4 };
  finish('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=');
  await expect(pending).rejects.toThrow('stale_binding');
  sdk.destroy();
});
