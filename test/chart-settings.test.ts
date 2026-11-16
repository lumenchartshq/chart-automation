import { describe, expect, it } from 'vitest';
import {
  CHART_CAPABILITY_SCHEMA_HASH, chartSettingsCapability, validateChartSettingsIntent, validateChartSettingsReceipt,
  validateEntityInspection, validateEntityInspectionRequest, type ChartBinding, } from '../src/index.js';

const binding: ChartBinding = { documentId: 'doc', instanceId: 'tab', epoch: 1, symbol: { ticker: 'AAPL' }, interval: '1D', revision: 0 };
const values = { chartType: 'candle', 'scale.mode': 'normal', 'scale.inverted': false, 'scale.autoScale': true };

describe('chart settings contract', () => {
  it('certifies chart type and the main price scale only', () => {
    expect(chartSettingsCapability().fields.map(field => field.id)).toEqual(['chartType', 'scale.mode', 'scale.inverted', 'scale.autoScale']);
    expect(chartSettingsCapability().fields[0]!.choices).toContain('heikin_ashi');
  });
  it('accepts a named patch and rejects unknown fields, bad values and empty patches', () => {
    expect(validateChartSettingsIntent({ settings: { chartType: 'heikin_ashi', 'scale.mode': 'log' } }).settings).toEqual({ chartType: 'heikin_ashi', 'scale.mode': 'log' });
    for (const settings of [{}, { chartType: 'renko' }, { 'scale.mode': 'logarithmic' }, { 'scale.inverted': 'yes' }, { background: '#000000' }, { timezone: 'UTC' }]) {
      expect(() => validateChartSettingsIntent({ settings })).toThrow();
    }
    expect(() => validateChartSettingsIntent({ settings: { chartType: 'line' }, chartId: 'c' })).toThrow('invalid_input');
  });
  it('accepts only an applied, unsaved receipt that shows the requested values', () => {
    const intent = validateChartSettingsIntent({ settings: { chartType: 'line' } });
    const receipt = { version: 1, operationId: 'op', chartId: 'c', state: 'applied', saved: false, values: { ...values, chartType: 'line' }, undoable: true };
    expect(validateChartSettingsReceipt(receipt, 'op', intent, 'c').values.chartType).toBe('line');
    for (const bad of [{ ...receipt, saved: true }, { ...receipt, state: 'committed' }, { ...receipt, values }, { ...receipt, values: { chartType: 'line' } }, { ...receipt, extra: 1 }]) {
      expect(() => validateChartSettingsReceipt(bad, 'op', intent, 'c')).toThrow();
    }
    expect(() => validateChartSettingsReceipt({ ...receipt, chartId: 'other' }, 'op', intent, 'c')).toThrow('stale_binding');
    expect(() => validateChartSettingsReceipt(receipt, 'other-op', intent)).toThrow('stale_binding');
  });
  it('inspects a chart by id with every field and its available chart types', () => {
    expect(() => validateEntityInspectionRequest({ entities: [{ kind: 'chart', id: 'primary' }] })).toThrow('invalid_input');
    const request = validateEntityInspectionRequest({ entities: [{ kind: 'chart', id: 'active' }] });
    const result = (entity: Record<string, unknown>) => ({ version: 1, schemaHash: CHART_CAPABILITY_SCHEMA_HASH, binding, entities: [entity], missing: [] });
    const chart = { kind: 'chart', id: 'active', values, chartTypes: ['candle', 'line'], editable: true };
    expect(validateEntityInspection(result(chart), request, binding).entities[0]).toEqual(chart);
    for (const bad of [{ ...chart, values: { chartType: 'candle' } }, { ...chart, chartTypes: [] }, { ...chart, chartTypes: ['renko'] }, { ...chart, chartTypes: ['line', 'line'] }, { ...chart, extra: 1 }]) {
      expect(() => validateEntityInspection(result(bad), request, binding)).toThrow('invalid_input');
    }
  });
});
