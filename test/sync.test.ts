import { expect, it } from 'vitest';
import { initialWorkspaceSync, validateWorkspaceSync, validateNavigationReceipt } from '../src/index.js';
it('accepts exactly the three boolean switches', () => {
  const initial = initialWorkspaceSync(); expect(validateWorkspaceSync(initial)).toEqual(initial);
  for (const value of [{ ...initial, time: 'true' }, { ...initial, symbol: true }, { ...initial, version: 1 }, { crosshair: true }]) expect(() => validateWorkspaceSync(value)).toThrow('invalid_input');
});
it('requires truthful unique linked viewport outcomes', () => {
  const receipt = { version: 1, operationId: 'view', chartId: 'primary', state: 'applied', selectionRevision: 0, binding: { documentId: 'doc', instanceId: 'tab', epoch: 1, revision: 0, symbol: { ticker: 'BTCUSD' }, interval: '1D' }, sync: { version: 1, revision: 1, time: true, dateRange: false, charts: [{ chartId: 'secondary', state: 'rejected', code: 'missing_history' }] } };
  expect(validateNavigationReceipt(receipt)).toEqual(receipt);
  expect(() => validateNavigationReceipt({ ...receipt, sync: { ...receipt.sync, charts: [...receipt.sync.charts, ...receipt.sync.charts] } })).toThrow('invalid_input');
  expect(() => validateNavigationReceipt({ ...receipt, sync: { ...receipt.sync, charts: [{ chartId: 'secondary', state: 'applied' }] } })).toThrow('invalid_input');
});
