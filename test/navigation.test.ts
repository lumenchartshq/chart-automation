import { expect, it, vi } from 'vitest';
import { validateSelectionIntent, validateSymbolSearch, validateViewIntent, type ChartBinding } from '../src/index.js';
const binding: ChartBinding = { documentId: 'doc', instanceId: 'tab', epoch: 1, symbol: { ticker: 'BT::AAPL::STOCK' }, interval: '1D', revision: 2 };
it('rejects invented properties, unbounded lookup and untyped views before delivery', () => {
  expect(() => validateSymbolSearch({ query: 'NVDA', limit: 21 })).toThrow('limit_exceeded');
  expect(() => validateSymbolSearch({ query: '', limit: 1 })).toThrow('invalid_input');
  expect(() => validateSelectionIntent({ chartId: 'primary' })).toThrow('invalid_input');
  expect(() => validateSelectionIntent({ chartId: 'primary', symbol: 'NVDA' })).toThrow('invalid_input');
  expect(() => validateViewIntent({ chartId: 'primary', action: 'range', from: 2, to: 1 })).toThrow('invalid_input');
  expect(() => validateViewIntent({ chartId: 'primary', action: 'latest', undo: true })).toThrow('invalid_input');
});
