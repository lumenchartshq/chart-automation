import { it, expect } from 'vitest';
import { initialWorkspace, validateWorkspaceDocument, validateWorkspaceTransition, validateWorkspaceReceipt } from '../src/index';
const selection = { symbol: 'NVDA', symbolId: 'stock:NVDA', instrumentType: 'stock', interval: '1D' };
const primary = () => initialWorkspace('session', selection);
function split() { const doc = primary(); doc.revision = 1; doc.layout = 'two_columns'; doc.charts.push({ ...structuredClone(doc.charts[0]!), id: 'issued-secondary', documentId: 'issued-secondary-document' }); doc.slots.push('issued-secondary'); return doc; }
it('preserves identity, geometry references and dormant charts across reorder and shrink', () => {
  const doc = split(); validateWorkspaceTransition(primary(), doc);
  const reordered = { ...doc, revision: 2, slots: [...doc.slots].reverse() }; validateWorkspaceTransition(doc, reordered);
  const shrunk = { ...reordered, revision: 3, layout: 'single' as const, slots: [doc.primaryChartId] }; validateWorkspaceTransition(reordered, shrunk);
  expect(shrunk.charts).toHaveLength(2); expect(shrunk.charts[0]?.documentId).toBe('session');
  expect(() => validateWorkspaceTransition(shrunk, { ...shrunk, revision: 4, charts: [shrunk.charts[0]!] })).toThrow();
  expect(() => validateWorkspaceTransition(doc, { ...reordered, charts: [...doc.charts].reverse() })).toThrow();
});
it('rejects unsupported versions, duplicate references and layouts beyond host configuration', () => {
  const doc = split(); expect(() => validateWorkspaceDocument(doc, 1)).toThrow('unsupported');
  expect(() => validateWorkspaceDocument({ ...doc, version: 2 })).toThrow('unsupported');
  expect(() => validateWorkspaceDocument({ ...doc, slots: [doc.primaryChartId, doc.primaryChartId] })).toThrow();
  expect(() => validateWorkspaceDocument({ ...doc, activeChartId: 'invented' })).toThrow();
  expect(() => validateWorkspaceDocument({ ...doc, charts: doc.charts.map(c => ({ ...c, documentId: 'session' })) })).toThrow();
  expect(() => validateWorkspaceDocument({ ...doc, charts: [...doc.charts, doc.charts[1]] })).toThrow();
  expect(() => validateWorkspaceDocument({ ...doc, layout: 'single', slots: ['issued-secondary'], activeChartId: 'issued-secondary' })).toThrow('unsupported');
});

it('separates applied timeframe settings from dataset readiness without weakening binding checks', () => {
  const binding = { documentId: 'session', instanceId: 'browser', epoch: 1, revision: 0, symbol: { ticker: 'stock:NVDA' }, interval: '30' };
  const receipt = { version: 1, operationId: 'timeframe', workspaceId: 'session', revision: 1, state: 'applied', dataReady: false, binding, charts: [{ chartId: 'session:primary', state: 'applied', binding }] };
  expect(validateWorkspaceReceipt(receipt).dataReady).toBe(false);
  expect(() => validateWorkspaceReceipt({ ...receipt, dataReady: 'no' })).toThrow('invalid_input');
  expect(() => validateWorkspaceReceipt({ ...receipt, state: 'committed' })).toThrow('invalid_input');
  expect(() => validateWorkspaceReceipt({ ...receipt, binding: undefined })).toThrow('invalid_input');
});
