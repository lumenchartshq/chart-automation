import { expect, it } from 'vitest';
import { createChartAutomation, type AutomationSeries, type AutomationDataResult } from '../src/sdk/index.js';

const request = { requestId: 'read', target: { id: 'chart', generation: 0 } };
const input = { seriesId: 'indicator', from: 1, to: 2, limit: 2 };
const series: AutomationSeries = { id: 'indicator', kind: 'study', fields: [{ name: 'value', type: 'number' }], timeUnit: 'milliseconds', readiness: 'ready' };
function setup(rows: AutomationDataResult['rows'], descriptor = series) {
  return createChartAutomation({ currentTarget: () => request.target, data: {
    series: () => [descriptor],
    read: () => ({ seriesId: descriptor.id, revision: 'r1', rows, coverage: { from: 1, to: 2, complete: true } }),
  } });
}
it.each([
  [{ time: 1, unknown: 2 }],
  [{ time: 1 }],
  [{ time: 1, value: null }],
  [{ time: 1, value: Infinity }],
  [{ time: 1, value: 2, extra: 3 }],
].map(rows => ({ rows })))('rejects rows that contradict declared fields: %j', async ({ rows }) => {
  const sdk = setup(rows);
  await expect(sdk.data.read(input, request)).rejects.toThrow('invalid_input'); sdk.destroy();
});
it('distinguishes optional from nullable fields', async () => {
  const descriptor: AutomationSeries = { ...series, fields: [
    { name: 'value', type: 'number', nullable: true },
    { name: 'volume', type: 'number', optional: true },
  ] };
  const sdk = setup([{ time: 1, value: null }, { time: 2, value: 3, volume: 0 }], descriptor);
  expect((await sdk.data.read(input, request)).rows).toHaveLength(2); sdk.destroy();
  const missing = setup([{ time: 1 }], descriptor);
  await expect(missing.data.read(input, request)).rejects.toThrow('invalid_input'); missing.destroy();
});
it.each([
  [{ name: 'time', type: 'number' as const }],
  [{ name: 'value', type: 'number' as const }, { name: 'value', type: 'number' as const }],
].map(fields => ({ fields })))('rejects reserved or duplicate field identities', ({ fields }) => {
  const sdk = setup([], { ...series, fields });
  expect(() => sdk.data.series()).toThrow('invalid_input'); sdk.destroy();
});
it('rejects duplicate series identities during discovery', () => {
  const sdk = createChartAutomation({ currentTarget: () => request.target, data: {
    series: () => [series, series], read: () => { throw new Error('must not read'); },
  } });
  expect(() => sdk.data.series()).toThrow('invalid_input'); sdk.destroy();
});
it('validates against the descriptor captured before asynchronous provider work', async () => {
  const descriptor = structuredClone(series);
  let finish!: (result: AutomationDataResult) => void;
  const sdk = createChartAutomation({ currentTarget: () => request.target, data: {
    series: () => [descriptor], read: () => new Promise(resolve => { finish = resolve; }),
  } });
  const pending = sdk.data.read(input, request);
  await Promise.resolve();
  descriptor.fields = [{ name: 'replacement', type: 'number' }];
  finish({ seriesId: 'indicator', revision: 'r1', rows: [{ time: 1, replacement: 3 }], coverage: { from: 1, to: 2, complete: true } });
  await expect(pending).rejects.toThrow('invalid_input'); sdk.destroy();
});
it('applies the same field validation to explicit history responses', async () => {
  const result = { seriesId: 'indicator', revision: 'r1', rows: [{ time: 1, extra: 3 }], coverage: { from: 1, to: 2, complete: true } };
  const sdk = createChartAutomation({ currentTarget: () => request.target, data: {
    series: () => [series], read: () => result, requestHistory: async () => result,
  } });
  await expect(sdk.data.requestHistory(input, request)).rejects.toThrow('invalid_input'); sdk.destroy();
});

it.each(['read', 'requestHistory'] as const)('validates %s responses against the original request if a provider mutates its input', async method => {
  const provider = async (value: typeof input) => {
    value.to = 3;
    value.limit = 3;
    return { seriesId: 'indicator', revision: 'r1', rows: [{ time: 3, value: 1 }], coverage: { from: 1, to: 3, complete: true } };
  };
  const sdk = createChartAutomation({ currentTarget: () => request.target, data: {
    series: () => [series], read: provider, requestHistory: provider,
  } });
  await expect(sdk.data[method](input, request)).rejects.toThrow('invalid_input');
  expect(input).toEqual({ seriesId: 'indicator', from: 1, to: 2, limit: 2 });
  sdk.destroy();
});
