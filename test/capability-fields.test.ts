import { describe, expect, it } from 'vitest';
import { validateCapabilityFields, validateCapabilityReset, type CapabilityField } from '../src/index.js';

const fields: CapabilityField[] = [
  { id: 'extend.right', title: 'Extend right', kind: 'boolean', writable: true },
  { id: 'levels', title: 'Levels', kind: 'collection', writable: true, maxItems: 24, item: [
    { id: 'color', title: 'Color', kind: 'color', writable: true },
    { id: 'coeff', title: 'Coefficient', kind: 'number', writable: true },
  ] },
];

describe('capability field validation', () => {
  it('accepts named fields and individual Fibonacci slots', () => {
    const patch = { 'extend.right': true, levels: { patch: [{ slot: 5, color: '#ff9800', coeff: 0.618 }] } };
    expect(validateCapabilityFields(patch, fields)).toEqual(patch);
  });
  it('validates reset targets and rejects duplicate or conflicting patches', () => {
    expect(validateCapabilityReset(['extend.right'], fields)).toEqual(['extend.right']);
    expect(() => validateCapabilityReset(['extend.right', 'extend.right'], fields)).toThrow();
    expect(() => validateCapabilityReset(['extend.right'], fields, { 'extend.right': true })).toThrow();
    expect(() => validateCapabilityReset(['missing'], fields)).toThrow();
  });
  it('rejects unknown fields, invalid values and duplicate or out-of-range slots', () => {
    for (const patch of [
      { unknown: true }, { 'extend.right': 'yes' }, { levels: { patch: [{ slot: 25, color: '#ff9800' }] } },
      { levels: { patch: [{ slot: 1, color: '#ff9800' }, { slot: 1, coeff: 1 }] } },
      { levels: { patch: [{ slot: 1, color: 'orange' }] } },
    ]) expect(() => validateCapabilityFields(patch, fields)).toThrow();
  });
});
