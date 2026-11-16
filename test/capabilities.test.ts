import { expect, it } from 'vitest';
import { CHART_CAPABILITIES, CHART_CAPABILITY_SCHEMA_HASH, chartCapabilityCatalog, validateEntityInspection, type ChartBinding, type DrawingCapability, type StudyCapability } from '../src/index.js';

it('returns filtered catalog pages and exact details from the snapshot', () => {
  const page = chartCapabilityCatalog({ kind: 'study', search: 'relative' });
  expect(page).toMatchObject({ version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, entries: [{ id: 'Relative Strength Index@chart-studies-1' }], nextCursor: null });
  expect(chartCapabilityCatalog({ id: 'trend_line' })).toEqual({ version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, capability: CHART_CAPABILITIES.find(entry => entry.id === 'trend_line') });
  expect(chartCapabilityCatalog({ cursor: '17' })).toMatchObject({ entries: [], nextCursor: null });
  expect(chartCapabilityCatalog({ kind: 'chart' })).toMatchObject({ entries: [{ kind: 'chart', id: 'chart', summary: 'Chart type and price scale' }] });
  expect(() => chartCapabilityCatalog({ id: 'chart' }, { kinds: ['drawing', 'study'] })).toThrow('unsupported');
  expect(() => chartCapabilityCatalog({ id: 'trend_line', search: 'line' })).toThrow('invalid_input');
  expect(() => chartCapabilityCatalog({ cursor: '-1' })).toThrow('invalid_input');
  expect(() => chartCapabilityCatalog({ cursor: 1 } as never)).toThrow('invalid_input');
  expect(() => chartCapabilityCatalog({ id: 'unknown' })).toThrow('unsupported');
  expect(chartCapabilityCatalog({ kind: 'study' }, { kinds: ['drawing'] })).toMatchObject({ entries: [] });
  expect(() => chartCapabilityCatalog({ id: 'Moving Average@chart-studies-1' }, { kinds: ['drawing'] })).toThrow('unsupported');
});

it('validates inspection responses against exact targets and the public allowlist', () => {
  const binding: ChartBinding = { documentId: 'doc', instanceId: 'tab', epoch: 1, symbol: { ticker: 'AAPL' }, interval: '1D', revision: 0 };
  const request = { entities: [{ kind: 'drawing' as const, id: 'a' }] };
  // A drawing reports exactly its family's certified fields; `null` marks a value the chart could not resolve.
  const trendLine = CHART_CAPABILITIES.find(entry => entry.kind === 'drawing' && entry.id === 'trend_line') as DrawingCapability;
  const values = { ...Object.fromEntries(trendLine.fields.map(field => [field.id, null])), color: '#ff0000', lineWidth: 2, lineStyle: 'solid', text: '' };
  const entity = { kind: 'drawing', id: 'a', family: 'trend_line', title: null, points: [{ price: 1, time: 1 }], visible: true, locked: false, selected: false, editable: true, owner: 'main-series', values, explicit: ['color'] };
  const result = { version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, binding, entities: [entity], missing: [] };
  expect(validateEntityInspection(result, request, binding)).toEqual(result);
  expect(() => validateEntityInspection({ ...result, entities: [{ ...entity, values: { private: true } }] }, request, binding)).toThrow('invalid_input');
  expect(() => validateEntityInspection({ ...result, entities: [{ ...entity, values: { ...entity.values, color: 'red' } }] }, request, binding)).toThrow('invalid_input');
  expect(() => validateEntityInspection({ ...result, entities: [{ ...entity, locked: true }] }, request, binding)).toThrow('invalid_input');
  expect(() => validateEntityInspection({ ...result, missing: ['a'] }, request, binding)).toThrow('invalid_input');
});

it('accepts bounded, exact and unique entity targets', async () => {
  const { validateEntityInspectionRequest } = await import('../src/index');
  const request = { entities: [{ kind: 'drawing', id: 'a' }, { kind: 'study', id: 'b' }] };
  expect(validateEntityInspectionRequest(request)).toEqual(request);
  expect(() => validateEntityInspectionRequest({ entities: Array.from({ length: 21 }, (_, i) => ({ kind: 'drawing', id: String(i) })) })).toThrow('limit_exceeded');
  expect(() => validateEntityInspectionRequest({ entities: [{ kind: 'drawing', id: 'a' }, { kind: 'drawing', id: 'a' }] })).toThrow('invalid_input');
  expect(() => validateEntityInspectionRequest({ entities: [{ kind: 'drawing', id: 'a' }, { kind: 'study', id: 'a' }] })).toThrow('invalid_input');
  expect(() => validateEntityInspectionRequest({ entities: [{ kind: 'drawing', id: 'a', all: true }] })).toThrow('invalid_input');
});

it('accepts existing uncertified drawings only as non-editable entries without geometry', () => {
  const binding: ChartBinding = { documentId: 'doc', instanceId: 'tab', epoch: 1, symbol: { ticker: 'AAPL' }, interval: '1D', revision: 0 };
  const request = { entities: [{ kind: 'drawing' as const, id: 'shape' }] };
  const entity = { kind: 'drawing', id: 'shape', family: 'triangle', title: null, points: [], visible: true, locked: false, selected: false, editable: false, owner: 'main-series', values: {}, explicit: [] };
  const result = (override: object) => ({ version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, binding, entities: [{ ...entity, ...override }], missing: [] });
  expect(validateEntityInspection(result({}), request, binding).entities[0]).toMatchObject({ family: 'triangle', editable: false });
  for (const override of [{ editable: true }, { points: [{ price: 1 }] }, { values: { color: '#ff0000' } }, { explicit: ['color'] }])
    expect(() => validateEntityInspection(result(override), request, binding)).toThrow('invalid_input');
});

it('validates custom study inspections against the chart descriptor', () => {
  const binding: ChartBinding = { documentId: 'doc', instanceId: 'tab', epoch: 1, symbol: { ticker: 'AAPL' }, interval: '1D', revision: 0 };
  const custom: StudyCapability = { kind: 'study', id: 'ScaledClose@custom-1', title: 'Scaled Close', placement: 'pane', inputs: [{ id: 'factor', title: 'Factor', kind: 'number', writable: true }], plots: [{ id: 'plot_0', title: 'Scaled', fields: [{ id: 'color', title: 'Color', kind: 'color', writable: true }] }] };
  const request = { entities: [{ kind: 'study' as const, id: 'custom' }] };
  const entity = { kind: 'study', id: 'custom', studyId: custom.id, title: 'Scaled Close', paneId: 'main', paneIndex: 0, scale: 'own', visible: true, editable: true, inputs: { factor: 2 }, styles: { plots: { plot_0: { color: '#ff9800' } } } };
  const result = (override: object) => ({ version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, binding, entities: [{ ...entity, ...override }], missing: [] });
  expect(validateEntityInspection(result({}), request, binding, [custom]).entities[0]).toMatchObject({ studyId: custom.id, editable: true });
  expect(() => validateEntityInspection(result({}), request, binding)).toThrow('invalid_input');
  expect(() => validateEntityInspection(result({ inputs: { factor: 'x' } }), request, binding, [custom])).toThrow('invalid_input');
  expect(validateEntityInspection(result({ editable: false, inputs: {}, styles: {} }), request, binding).entities[0]).toMatchObject({ editable: false });
});
