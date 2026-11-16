import { expect, it, vi } from 'vitest';
import { ChartCommandError } from '../src/core-contracts/index.js';
import { createChartAutomation, createAutomationTools, defineCommand, field, type AutomationToolMiddleware } from '../src/sdk/index.js';
const target = { id: 'chart', generation: 0 };
const request = (requestId: string) => ({ requestId, target });
function setup(commands?: string[]) {
  return createChartAutomation({ currentTarget: () => target, data: {
    series: () => [{ id: 'rsi', kind: 'study', fields: [{ name: 'value', type: 'number', nullable: true }], timeUnit: 'milliseconds', readiness: 'pending' }],
    read() { throw new Error('not ready'); },
  } }, commands ? { commands } : {});
}
const echo = defineCommand({
  name: 'example.echo', effect: 'mutation', description: 'Echo text.', instructions: 'Echo only on request.',
  input: { text: field.string(16) }, output: { text: field.string(16) },
  execute: ({ text }) => ({ text }),
});

it('discovers series IDs and readiness without guessing or reading data', async () => {
  const sdk = setup();
  const tools = createAutomationTools(sdk, { request });
  const discover = tools.find(tool => tool.name === 'data_series')!;
  expect(discover).toMatchObject({ commandName: 'data.series', effect: 'read', concurrency: 'shared' });
  expect(await discover.execute('discover', {})).toEqual([{ id: 'rsi', kind: 'study', fields: [{ name: 'value', type: 'number', nullable: true }], timeUnit: 'milliseconds', readiness: 'pending' }]);
  expect(await discover.execute('invalid', { seriesId: 'rsi' })).toEqual({ error: 'invalid_input', details: { reason: 'unknown field' } });
  expect(await tools.find(tool => tool.name === 'data_read')!.execute('read', { seriesId: 'rsi', from: 0, to: 1, limit: 1 })).toEqual({ error: 'busy' });
  sdk.destroy();
  expect(await discover.execute('disposed', {})).toEqual({ error: 'unavailable' });
});
it('does not advertise discovery when data reads are denied', () => {
  const sdk = setup(['example.other']);
  expect(createAutomationTools(sdk, { request }).some(tool => tool.name.startsWith('data_'))).toBe(false);
  sdk.destroy();
});
it('keeps the deprecated positional signature', async () => {
  const sdk = setup();
  sdk.extensions.register(echo);
  const tool = createAutomationTools(sdk, request).find(entry => entry.commandName === 'example.echo')!;
  expect(await tool.execute('legacy', { text: 'hi' })).toEqual({ text: 'hi' });
  sdk.destroy();
});
it('renames, prefixes, filters and rejects conflicting tool names', () => {
  const sdk = setup();
  sdk.extensions.register(echo);
  const names = createAutomationTools(sdk, { toolPrefix: 'chart_', toolNames: { 'data.read': 'read_chart_bars' } }).map(tool => tool.name);
  expect(names).toEqual(['chart_example_echo', 'chart_data_series', 'read_chart_bars']);
  expect(createAutomationTools(sdk, { include: tool => tool.effect === 'read' }).map(tool => tool.name)).toEqual(['data_series', 'data_read']);
  expect(() => createAutomationTools(sdk, { toolNames: { 'example.echo': 'data_read' } })).toThrow(expect.objectContaining({ code: 'operation_conflict' }));
  expect(createAutomationTools(sdk, { toolNames: { 'example.echo': 'data_read' }, include: tool => tool.commandName !== 'data.read' }).map(tool => tool.name)).toContain('data_read');
  expect(() => createAutomationTools(sdk, { toolNames: { 'example.echo': 'Echo Tool' } })).toThrow(expect.objectContaining({ code: 'invalid_input' }));
  sdk.destroy();
});
it('runs middleware outermost first and lets it refuse calls', async () => {
  const sdk = setup();
  sdk.extensions.register(echo);
  const order: string[] = [];
  const log: AutomationToolMiddleware = async (call, next) => { order.push(`log:${call.tool.name}:${call.request.requestId}`); const result = await next(); order.push('log:done'); return result; };
  const confirm: AutomationToolMiddleware = async (call, next) => {
    if (call.tool.effect === 'mutation' && (call.input as { text: string }).text === 'no') throw new ChartCommandError('cancelled');
    return next();
  };
  const tool = createAutomationTools(sdk, { use: [log, confirm] }).find(entry => entry.name === 'example_echo')!;
  expect(await tool.execute('call-1', { text: 'yes' })).toEqual({ text: 'yes' });
  expect(await tool.execute('call-2', { text: 'no' })).toEqual({ error: 'cancelled' });
  expect(order).toEqual(['log:example_echo:call-1', 'log:done', 'log:example_echo:call-2']);
  sdk.destroy();
});
it('maps errors without messages, or rethrows when asked', async () => {
  const sdk = setup();
  sdk.extensions.register({ ...echo, execute: () => { throw new Error('secret internal detail'); } });
  const tool = createAutomationTools(sdk, { errorResult: (code) => ({ failed: code }) })[0]!;
  expect(await tool.execute('a', { text: 'x' })).toEqual({ failed: 'unavailable' });
  const rethrow = createAutomationTools(sdk, { errorResult: null })[0]!;
  await expect(rethrow.execute('b', { text: 'x' })).rejects.toThrow('secret internal detail');
  sdk.destroy();
});
it('advertises capture only with an image adapter and joins instructions', async () => {
  const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
  const sdk = createChartAutomation({ currentTarget: () => target, capture: { image: async context => ({ blob, width: 1, height: 1, capturedAt: new Date(0).toISOString(), target: context.target, visibleRange: null, revision: '1' }) } });
  sdk.extensions.register(echo);
  sdk.extensions.register({ ...echo, name: 'example.quiet', instructions: undefined });
  expect(createAutomationTools(sdk).some(tool => tool.name === 'capture_image')).toBe(false);
  const imageResult = vi.fn(capture => ({ bytes: capture.blob.size }));
  const capture = createAutomationTools(sdk, { imageResult }).find(tool => tool.name === 'capture_image')!;
  expect(await capture.execute('shot', {})).toEqual({ bytes: 1 });
  expect(sdk.instructions()).toBe('Echo only on request.');
  sdk.destroy();
});

const plot = defineCommand({
  name: 'example.plot', effect: 'mutation', description: 'Plot shapes.',
  examples: [{ description: 'One line', input: { operations: [{ kind: 'line', points: [{ time: 1, price: 2 }] }] } }, { input: { operations: [] } }],
  input: {
    operations: field.array(field.union('kind', {
      line: { points: field.array(field.object({ time: field.integer({ minimum: 0 }), price: field.number() }), { maxItems: 4 }) },
      label: { text: field.string(32) },
    }), { maxItems: 8 }),
  },
  output: { count: field.integer() },
  execute: ({ operations }) => ({ count: operations.length }),
});
it('names the path and a fixed reason for a bad nested field', async () => {
  const sdk = setup();
  sdk.extensions.register(plot);
  const tool = createAutomationTools(sdk).find(entry => entry.commandName === 'example.plot')!;
  const line = (time: unknown) => ({ kind: 'line', points: [{ time: 1, price: 1 }, { time, price: 1 }] });
  expect(await tool.execute('ok', { operations: [line(2)] })).toEqual({ count: 1 });
  expect(await tool.execute('bad', { operations: [line(1), { kind: 'label', text: 'x' }, line(1.5)] }))
    .toEqual({ error: 'invalid_input', details: { path: 'operations[2].points[1].time', reason: 'expected integer' } });
  expect(await tool.execute('variant', { operations: [{ kind: 'secret-variant-name' }] }))
    .toEqual({ error: 'invalid_input', details: { path: 'operations[0].kind', reason: 'unknown variant' } });
  expect(await tool.execute('missing', {})).toEqual({ error: 'invalid_input', details: { path: 'operations', reason: 'missing field' } });
  const extra = await tool.execute('extra', { operations: [{ kind: 'label', text: 'x', 'secret-key': 1 }] });
  expect(extra).toEqual({ error: 'invalid_input', details: { path: 'operations[0]', reason: 'unknown field' } });
  expect(JSON.stringify(extra)).not.toContain('secret');
  sdk.destroy();
});
it('reports an invalid handler result without a field path, so it cannot read as bad input', async () => {
  const sdk = setup();
  sdk.extensions.register(defineCommand({
    name: 'example.broken', effect: 'read', description: 'Broken.',
    input: { n: field.integer() }, output: { close: field.number() },
    execute: () => ({ close: 'oops' as never }),
  }));
  const tool = createAutomationTools(sdk).find(entry => entry.commandName === 'example.broken')!;
  expect(await tool.execute('a', { n: 1 })).toEqual({ error: 'unavailable', details: { reason: 'invalid result' } });
  expect(await tool.execute('b', { n: 'x' })).toEqual({ error: 'invalid_input', details: { path: 'n', reason: 'expected integer' } });
  sdk.destroy();
});
it('omits details a thrower did not set, and custom error results opt in', async () => {
  const sdk = setup();
  sdk.extensions.register({ ...echo, execute: () => { throw new ChartCommandError('busy', 'host text'); } });
  const [tool] = createAutomationTools(sdk);
  expect(await tool!.execute('a', { text: 'x' })).toEqual({ error: 'busy' });
  const custom = createAutomationTools(sdk, { errorResult: code => ({ error: code }) })[0]!;
  expect(await custom.execute('b', { text: 1 })).toEqual({ error: 'invalid_input' });
  sdk.destroy();
});
it('appends bounded examples to tool descriptions and leaves commands without examples unchanged', () => {
  const sdk = setup();
  sdk.extensions.register(echo);
  sdk.extensions.register(plot);
  sdk.extensions.register({ ...echo, name: 'example.huge', examples: [{ input: { text: 'a' } }, { description: 'x'.repeat(700), input: { text: 'b' } }] });
  const tools = createAutomationTools(sdk);
  const byName = (name: string) => tools.find(tool => tool.commandName === name)!.description;
  expect(byName('example.echo')).toBe('Echo text.');
  expect(byName('example.plot')).toBe('Plot shapes.\n\nExamples:\n- One line: {"operations":[{"kind":"line","points":[{"time":1,"price":2}]}]}\n- {"operations":[]}');
  expect(byName('example.huge')).toBe('Echo text.\n\nExamples:\n- {"text":"a"}');
  sdk.destroy();
});
it('lets describe override wording and parameters before include and validation', async () => {
  const sdk = setup();
  sdk.extensions.register(echo);
  const seen: string[] = [];
  const tools = createAutomationTools(sdk, {
    describe: tool => tool.commandName === 'example.echo' ? { description: 'Repeat the text.', parameters: { type: 'object', properties: { text: { type: 'string' } } } } : undefined,
    include: tool => { seen.push(tool.description); return tool.commandName !== 'data.read'; },
  });
  const tool = tools.find(entry => entry.commandName === 'example.echo')!;
  expect(tool).toMatchObject({ description: 'Repeat the text.', parameters: { type: 'object', properties: { text: { type: 'string' } } } });
  expect(seen).toContain('Repeat the text.');
  expect(tools.find(entry => entry.commandName === 'data.series')!.description).toMatch(/^Discover readable series/);
  expect(await tool.execute('call', { text: 'hi' })).toEqual({ text: 'hi' });
  expect(await tool.execute('bad', { text: 'hi', extra: 1 })).toMatchObject({ error: 'invalid_input' });
  expect(() => createAutomationTools(sdk, { describe: () => ({ description: ' ' }) })).toThrow(expect.objectContaining({ code: 'invalid_input' }));
  expect(() => createAutomationTools(sdk, { describe: () => ({ parameters: [] as never }) })).toThrow(expect.objectContaining({ code: 'invalid_input' }));
  sdk.destroy();
});
