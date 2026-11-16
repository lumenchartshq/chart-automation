import { describe, expect, it } from 'vitest';
import { validateBatch, validateOperations } from '../src/index.js';

const binding = { documentId: 'doc', instanceId: 'tab', epoch: 1, symbol: { ticker: 'AAPL' }, interval: '1D', revision: 0 };
const line = [{ time: 1700000000000, price: 10 }, { time: 1700000060000, price: 12 }];

describe('drawing settings operation shape', () => {
  it('is rejected as unsupported unless settings and catalog 2 are negotiated', () => {
    const operation = { action: 'update', id: 'a', settings: { 'extend.right': true } };
    expect(() => validateOperations([operation], 2)).toThrow('unsupported');
    expect(() => validateOperations([operation], undefined, 1)).toThrow('unsupported');
    expect(validateOperations([operation], 2, 1)).toEqual([operation]);
    expect(() => validateOperations([{ action: 'update', id: 'a', reset: ['color'] }], 2)).toThrow('unsupported');
  });
  it('accepts settings or reset as the only change of an update', () => {
    expect(validateOperations([{ action: 'update', id: 'a', reset: ['color'] }], 2, 1)).toHaveLength(1);
    expect(validateOperations([{ action: 'update', id: 'a', settings: { visible: false } }], 2, 1)).toHaveLength(1);
    expect(() => validateOperations([{ action: 'update', id: 'a' }], 2, 1)).toThrow('invalid_input');
  });
  it('rejects empty, non-object, duplicate and creation-time reset input', () => {
    for (const operation of [
      { action: 'update', id: 'a', settings: {} },
      { action: 'update', id: 'a', settings: [] },
      { action: 'update', id: 'a', reset: [] },
      { action: 'update', id: 'a', reset: ['color', 'color'] },
      { action: 'update', id: 'a', reset: [1] },
      { action: 'create', type: 'trend_line', points: line, reset: ['color'] },
    ]) expect(() => validateOperations([operation], 2, 1)).toThrow('invalid_input');
  });
  it('rejects a style value that disagrees with the same field in settings', () => {
    const create = { action: 'create', type: 'trend_line', points: line };
    expect(() => validateOperations([{ ...create, style: { color: '#ff0000' }, settings: { color: '#00ff00' } }], 2, 1)).toThrow('invalid_input');
    expect(validateOperations([{ ...create, style: { color: '#ff0000' }, settings: { color: '#ff0000', 'extend.right': true } }], 2, 1)).toHaveLength(1);
  });
  it('carries the settings version on a batch and rejects unknown versions', () => {
    const operations = [{ action: 'update', id: 'a', settings: { visible: false } }];
    const batch = { version: 1, operationId: 'op', binding, operations, catalogVersion: 2, drawingSettingsVersion: 1 };
    expect(validateBatch(batch).drawingSettingsVersion).toBe(1);
    expect(() => validateBatch({ ...batch, drawingSettingsVersion: 2 })).toThrow('unsupported');
    const { drawingSettingsVersion: _omitted, ...legacy } = batch;
    expect(() => validateBatch(legacy)).toThrow('unsupported');
  });
});

describe('same-batch references to new drawings', () => {
  const create = (ref?: string) => ({ action: 'create', type: 'trend_line', points: line, ...(ref ? { ref } : {}) });
  const group = { action: 'group.create', name: 'Pair', ids: ['ref:a', 'ref:b'] };
  it('lets a group name drawings created earlier in the batch', () => {
    expect(validateOperations([create('a'), create('b'), group], 2, 1)).toHaveLength(3);
    expect(validateOperations([create('a'), { action: 'group.members', id: 'g', add: ['ref:a', 'existing'] }], 2, 1)).toHaveLength(2);
  });
  it('rejects references that are undeclared, late, repeated, malformed or removed', () => {
    for (const operations of [
      [create('a'), group],
      [group, create('a'), create('b')],
      [create('a'), create('a')],
      [create('A')],
      [create('1a')],
      [create('a'), { action: 'group.members', id: 'g', remove: ['ref:a'] }],
    ]) expect(() => validateOperations(operations, 2, 1)).toThrow();
    expect(() => validateOperations([create('a'), { action: 'group.members', id: 'g', remove: ['ref:a'] }], 2, 1)).toThrow('unsupported');
  });
  it('is unsupported unless settings are negotiated', () => {
    expect(() => validateOperations([create('a')], 2)).toThrow('unsupported');
    expect(() => validateOperations([group], 2)).toThrow('unsupported');
    expect(() => validateOperations([{ action: 'update', id: 'x', ref: 'a', style: { color: '#ff0000' } }], 2, 1)).toThrow('invalid_input');
  });
});
