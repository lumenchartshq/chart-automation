import { expect, it } from 'vitest';
import { canonicalDrawingHistoryDocument, DRAWING_HISTORY_PROJECTION_VERSION } from '../src/index';

const source = (zorder?: number) => ({ id: 'line', symbol: 'AAPL', ownerSource: 'main-series', state: { type: 'horizontal_line', points: [{ price: 10 }], options: { shape: 'horizontal_line' }, ...(zorder === undefined ? {} : { zorder }) } });
it('fills serialization defaults using native stable restore order while preserving explicit zorders', () => {
  const sparse = { version: 2, sources: { high: source(8), missing: source(), equal: source(0), lower: source(-1), removed: null }, drawing_groups: { removed: null } };
  const canonical = canonicalDrawingHistoryDocument(sparse) as any;
  expect(DRAWING_HISTORY_PROJECTION_VERSION).toBe(1);
  expect(Object.keys(canonical.sources)).toEqual(['equal', 'high', 'lower', 'missing']);
  expect(canonical.sources.missing.state.zorder).toBe(1);
  expect(canonical.sources.equal.state.zorder).toBe(0);
  expect(canonical.sources.high.state.zorder).toBe(8);
  expect(canonical.sources.missing).toMatchObject({ currencyId: null, unitId: null, state: { visible: true, userEditEnabled: true, isSelectionEnabled: true, saveEnabled: true, showInObjectsTree: true } });
  expect(canonical.drawing_groups).toEqual({});
  expect(sparse.sources.missing.state).not.toHaveProperty('zorder');
  expect(JSON.stringify(canonicalDrawingHistoryDocument(canonical))).toBe(JSON.stringify(canonical));
  function reverseKeys(value: any): any {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  }
  expect(JSON.stringify(canonicalDrawingHistoryDocument(reverseKeys(canonical)))).toBe(JSON.stringify(canonical));
});
it('ignores only derived caches/default omissions and retains real anchors, settings and group edits', () => {
  const before = { version: 2, sources: { line: source() }, drawing_groups: { group: { id: 'group', name: 'Levels', symbol: 'AAPL' } } };
  const after = canonicalDrawingHistoryDocument(before) as any;
  after.sources.line.state.normalizedPoints = [{ time: 100, price: 10, bar: 1 }];
  expect(canonicalDrawingHistoryDocument(after)).toEqual(canonicalDrawingHistoryDocument(before));
  for (const edit of [(doc: any) => { doc.sources.line.state.points[0].price = 11; }, (doc: any) => { doc.sources.line.state.options.color = '#ff0000'; }, (doc: any) => { doc.drawing_groups.group.locked = true; }]) {
    const changed = structuredClone(after); edit(changed);
    expect(canonicalDrawingHistoryDocument(changed)).not.toEqual(canonicalDrawingHistoryDocument(before));
  }
});
it('rejects unknown versions and invalid restore-order inputs', () => {
  expect(() => canonicalDrawingHistoryDocument({ version: 1 })).toThrow('unsupported');
  expect(() => canonicalDrawingHistoryDocument({ version: 4 })).toThrow('unsupported');
  expect(canonicalDrawingHistoryDocument({ version: 3, sources: { line: source() }, drawing_groups: {} }).version).toBe(3);
  expect(() => canonicalDrawingHistoryDocument({ version: 2, sources: { line: { ...source(), state: { zorder: Infinity } } }, drawing_groups: {} })).toThrow('invalid_input');
});
it('retains native render order for tied explicit zorders without assigning ranks to entities', () => {
  const first = { version: 2, sources: { a: source(0), b: source(0) }, drawing_groups: {} };
  const second = { ...first, sources: { b: source(0), a: source(0) } };
  const projected = canonicalDrawingHistoryDocument(first) as any;
  expect(projected.historySourceOrder).toEqual(['a', 'b']);
  expect(canonicalDrawingHistoryDocument(second)).not.toEqual(projected);
  expect(canonicalDrawingHistoryDocument(second).sources).toEqual(projected.sources);
  expect(JSON.stringify(canonicalDrawingHistoryDocument(projected))).toBe(JSON.stringify(projected));
});
