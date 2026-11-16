import { describe, it, expect } from 'vitest';
import { chartCapabilityCatalog, validateStudyList, type ChartStudyApi, type StudyCapability, type StudyDocument } from '../src/index';
import { createTestAutomation } from '../src/sdk/testing.js';
import { studyInput, studyInputSchema } from '../src/sdk/native-schemas.js';
import { STUDY_IDS, STUDY_LIMITS, sameStudyBinding, validateStudyOperations, validateStudyBatch, validateStudyDocument, validateStudyRead, validateStudyReceipt, validateStudyContext, validateStudyTargetPatch, validateStudyInputs, validateStudyStyles, studyCalculatedIds, studyStyleGroups, isStudyPaneId, isDetachedStudyPaneId, newStudyPaneId } from '../src/index';
const binding = { documentId: 'session', instanceId: 'tab', epoch: 1, symbol: { ticker: 'AAPL' }, interval: '1D', revision: 0 };
const payload = { version: 3, panes: [{ id: 'main', height: 300, collapsed: false, sources: ['main', 'manual-volume'] }, { id: 'pane:script', height: 0, collapsed: false, sources: ['script'] }], studies: [{ id: 'manual-volume', source: { type: 'java', studyId: 'Volume@chart-studies-1' } }], comparisons: [], priceScales: {} };
const document = { version: 1, documentId: 'session', chartId: 'primary', revision: 1, payload };
describe('negotiated built-in study contracts', () => {
  it('validates version 2 public inputs against the certified study descriptors', () => {
    const macd = 'Moving Average Convergence/Divergence@chart-studies-1';
    const bb = 'Bollinger Bands@chart-studies-1';
    expect(validateStudyInputs({ fastLength: 12, signalLength: 50, source: 'hlc3' }, macd)).toEqual({ fastLength: 12, signalLength: 50, source: 'hlc3' });
    expect(validateStudyInputs({ multiplier: 1.5 }, bb)).toEqual({ multiplier: 1.5 });
    for (const inputs of [{ signalLength: 51 }, { fastLength: 1.5 }, { source: 'script-primary$0' }, { in_0: 12 }, {}, { multiplier: Infinity }]) {
      expect(() => validateStudyInputs(inputs, macd)).toThrow();
    }
    expect(() => validateStudyInputs({ multiplier: 0 }, bb)).toThrow('invalid_input');
  });
  it('validates version 2 styles by exact study and field', () => {
    const bb = 'Bollinger Bands@chart-studies-1';
    const macd = 'Moving Average Convergence/Divergence@chart-studies-1';
    expect(validateStudyStyles({ plots: { plot_0: { color: '#123456', style: 'dotted', width: 3 } }, fills: { fill_0: { visible: false } } }, bb)).toBeTruthy();
    for (const styles of [{}, { plots: {} }, { plots: { plot_0: { width: 9 } } }, { fills: { fill_0: { color: 'red' } } }, { bands: { hline_0: { value: 5 } } }, { plots: { plot_0: { 'color.path': '#ffffff' } } }]) {
      expect(() => validateStudyStyles(styles, bb)).toThrow();
    }
    expect(() => validateStudyStyles({ plots: { plot_0: { color: '#ffffff' } } }, macd)).toThrow('unsupported');
    expect(validateStudyOperations([{ action: 'add', studyId: bb, styles: { fills: { fill_0: { visible: true } } } }])).toHaveLength(1);
  });
  it('carries ordered pane IDs and no study catalog in chart context', () => {
    const context = { version: 1, chartId: 'primary', documentId: 'session', revision: 0, panes: [{ id: 'main', position: 0 }, { id: 'pane:script', position: 1 }], limits: { studies: 16, panes: 8 }, count: 0, paneCount: 1, comparisons: [] };
    expect(validateStudyContext(context).panes.map(pane => pane.id)).toEqual(['main', 'pane:script']);
    // Study descriptors come only from the capability snapshot.
    expect(() => validateStudyContext({ ...context, catalog: [] })).toThrow('invalid_input');
    expect(() => validateStudyContext({ ...context, panes: [{ id: 'main', position: 0 }, { id: 'main', position: 1 }] })).toThrow('invalid_input');
    expect(() => validateStudyContext({ ...context, panes: [{ id: 'main', position: 1 }] })).toThrow('invalid_input');
  });
  it('keeps study CAS separate from drawing revision while preserving identity fences', () => {
    expect(sameStudyBinding(binding, { ...binding, revision: 50 })).toBe(true);
    for (const patch of [{ documentId: 'other' }, { instanceId: 'other' }, { epoch: 2 }, { interval: '1H' }, { symbol: { ticker: 'MSFT' } }]) expect(sameStudyBinding(binding, { ...binding, ...patch })).toBe(false);
  });
  it('supports only bounded typed MA and RSI inputs and specifically resolved targets', () => {
    expect(validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[0], inputs: { length: 20, source: 'hlc3', offset: -2 } }, { action: 'update', id: 'manual-ma', inputs: { length: 50 } }, { action: 'remove', id: 'selected-rsi' }])).toHaveLength(3);
    for (const inputs of [{ length: 0 }, { length: 1.5 }, { length: Infinity }, { offset: 10001 }, { source: 'script-primary$0' }, { symbol: 'SPY' }, { smoothingLength: 20 }, {}]) expect(() => validateStudyTargetPatch({ inputs: inputs as Record<string, number> }, STUDY_IDS[0])).toThrow();
    expect(() => validateStudyOperations([{ action: 'update', id: 'manual-ma', inputs: {} }])).toThrow('invalid_input');
    expect(validateStudyOperations([{ action: 'update', id: 'manual-rsi', inputs: { offset: 2 } }])).toHaveLength(1);
    expect(() => validateStudyTargetPatch({ inputs: { offset: 2 } }, STUDY_IDS[1])).toThrow('unsupported');
    expect(() => validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[1], inputs: { length: 2001 } }])).toThrow();
    expect(() => validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[1], inputs: { source: 'close' } }])).toThrow();
    expect(validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[0], inputs: { offset: -10000, source: 'ohlc4' } }])).toHaveLength(1);
    expect(validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[0], inputs: { offset: 10000 } }])).toHaveLength(1);
    expect(() => validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[0], inputs: { offset: -10001 } }])).toThrow('invalid_input');
    expect(() => validateStudyOperations([{ action: 'add', studyId: STUDY_IDS[0], inputs: { source: 'invalid' } }])).toThrow('invalid_input');
    expect(() => validateStudyOperations([{ action: 'add', studyId: 'Volume@chart-studies-1' }])).toThrow('unsupported');
    expect(() => validateStudyOperations([{ action: 'remove', id: '' }])).toThrow();
  });
  it('strictly versions documents and batches while retaining unsupported manual native records', () => {
    expect(validateStudyDocument(document)).toEqual(document);
    const batch = { version: 1, operationId: 'op', binding, chartId: 'primary', expectedRevision: 1, operations: [{ action: 'add', studyId: STUDY_IDS[1] }] };
    expect(validateStudyBatch(batch)).toEqual(batch);
    expect(() => validateStudyBatch({ ...batch, version: 2 })).toThrow('unsupported');
    expect(() => validateStudyBatch({ ...batch, expectedRevision: -1 })).toThrow();
    expect(() => validateStudyDocument({ ...document, version: 2 })).toThrow('unsupported');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, version: 1 } })).toThrow('unsupported');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, symbol: 'SPY' } })).toThrow();
    for (const source of [{ type: 'pine-script', studyId: 'Script$STD;a@chart-scripting' }, { type: 'compare', studyId: 'Compare@chart-studies-1' }, { type: 'java', studyId: STUDY_IDS[0], descriptor: { source: 'script' } }]) expect(() => validateStudyDocument({ ...document, payload: { ...payload, studies: [{ id: 'foreign', source }] } })).toThrow();
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, studies: [payload.studies[0], payload.studies[0]] } })).toThrow();
  });
  it('requires every saved source in exactly one pane, with one main and one Lumen Script placement', () => {
    const panes = payload.panes;
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, panes: [panes[0]] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, panes: [{ ...panes[0], sources: ['main'] }, panes[1]] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, panes: [panes[0], { ...panes[1], sources: ['script', 'manual-volume'] }] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, panes: [...panes, { height: 10, collapsed: false, sources: [] }] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, panes: [panes[0], { ...panes[1], sources: ['script', 'ghost'] }] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, priceScales: { 'study:ghost': {} } } })).toThrow('invalid_input');
    const shared = { ...payload, panes: [{ id: 'main', height: 300, collapsed: false, sources: ['main'] }, { id: 'pane:script', height: 120, collapsed: false, sources: ['script', 'manual-volume'] }] };
    expect(validateStudyDocument({ ...document, payload: shared }).payload.panes[1]!.sources).toEqual(['script', 'manual-volume']);
  });
  it('reads a document saved before the Lumen Script rename and writes the new placement id', () => {
    const legacyPanes = payload.panes.map(pane => ({ ...pane, sources: pane.sources.map(source => source === 'script' ? 'pine' : source) }));
    const legacy = { ...document, payload: { ...payload, panes: legacyPanes } };
    const upgraded = validateStudyDocument(legacy);
    expect(upgraded.payload.panes.map(pane => pane.sources)).toEqual([['main', 'manual-volume'], ['script']]);
    expect(legacy.payload.panes[1]!.sources).toEqual(['pine']);
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, panes: [payload.panes[0], { ...payload.panes[1], sources: ['script', 'pine'] }] } })).toThrow('invalid_input');
  });
  it('preserves both placements and the price scale when a legacy study ID is script', () => {
    const legacy = {
      ...document,
      payload: {
        ...payload,
        studies: [
          { ...payload.studies[0], id: 'script', scaleBinding: { scaleId: 'study:script' } },
          { ...payload.studies[0], id: 'script-1', preferredPriceScale: 'study:script' },
        ],
        panes: [{ ...payload.panes[0], sources: ['main', 'script', 'script-1'] }, { ...payload.panes[1], sources: ['pine'] }],
        priceScales: { 'study:script': { inverted: true } },
      },
    };
    const upgraded = validateStudyDocument(legacy);
    expect(upgraded.payload.panes.map(pane => pane.sources)).toEqual([['main', 'script-2', 'script-1'], ['script']]);
    expect(upgraded.payload.studies).toMatchObject([
      { id: 'script-2', scaleBinding: { scaleId: 'study:script-2' } },
      { id: 'script-1', preferredPriceScale: 'study:script-2' },
    ]);
    expect(upgraded.payload.priceScales).toEqual({ 'study:script-2': { inverted: true } });
    expect(validateStudyDocument(upgraded)).toEqual(upgraded);
    expect(legacy.payload.studies[0]?.id).toBe('script');
  });
  it('keeps a native study named pine in a canonical document', () => {
    const current = {
      ...document,
      payload: {
        ...payload,
        studies: [{ ...payload.studies[0], id: 'pine' }],
        panes: [{ ...payload.panes[0], sources: ['main', 'pine'] }, payload.panes[1]],
      },
    };
    expect(validateStudyDocument(current)).toEqual(current);
  });
  it('requires distinct stable identities and rejects older documents', () => {
    const panes = [{ ...payload.panes[0], id: 'main' }, { ...payload.panes[1], id: 'pane:script' }];
    const next = { ...document, payload: { ...payload, version: 3, panes } };
    expect(validateStudyDocument(next)).toEqual(next);
    expect(() => validateStudyDocument({ ...next, payload: { ...next.payload, panes: [panes[0], { ...panes[1], id: 'main' }] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...next, payload: { ...next.payload, panes: [{ ...panes[0], id: 'pane:wrong' }, panes[1]] } })).toThrow('invalid_input');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, version: 2 } })).toThrow('unsupported');
  });
  it('bounds reads, saved capacity and operations without accepting broad remove actions', () => {
    expect(validateStudyRead({ offset: 0, limit: 20 })).toEqual({ offset: 0, limit: 20 });
    expect(() => validateStudyRead({ offset: -1, limit: 20 })).toThrow();
    expect(() => validateStudyRead({ offset: 0, limit: 21 })).toThrow('limit_exceeded');
    expect(() => validateStudyOperations(Array.from({ length: STUDY_LIMITS.operationsPerBatch + 1 }, () => ({ action: 'add', studyId: STUDY_IDS[0] })))).toThrow('limit_exceeded');
    expect(() => validateStudyOperations([{ action: 'remove_all' }])).toThrow('unsupported');
    expect(() => validateStudyDocument({ ...document, payload: { ...payload, studies: Array.from({ length: STUDY_LIMITS.savedStudies + 1 }, (_, i) => ({ ...payload.studies[0], id: `manual-${i}` })) } })).toThrow('limit_exceeded');
  });
  it('keeps separate truthful study receipts and rejects unknown versions and targets', () => {
    const receipt = { version: 1, operationId: 'op', chartId: 'primary', documentId: 'session', state: 'committed', revision: 2, ids: ['ai-op'] };
    expect(validateStudyReceipt(receipt)).toEqual(receipt);
    expect(validateStudyReceipt({ ...receipt, state: 'applied' }).state).toBe('applied');
    expect(() => validateStudyReceipt({ ...receipt, version: 2 })).toThrow();
    expect(() => validateStudyReceipt({ ...receipt, chartId: '' })).toThrow();
    expect(() => validateStudyReceipt({ ...receipt, source: 'script' })).toThrow();
  });
  it('reports calculation for exactly the added and updated studies of an applied batch', () => {
    const operations = [{ action: 'add' as const, studyId: STUDY_IDS[0] }, { action: 'update' as const, id: 'ma', inputs: { length: 5 } }, { action: 'update' as const, id: 'ma', styles: { plots: { plot_0: { visible: false } } } }, { action: 'remove' as const, id: 'rsi' }];
    expect(studyCalculatedIds('op', operations)).toEqual(['ai-study-op-0', 'ma']);
    const applied = { version: 1, operationId: 'op', chartId: 'primary', documentId: 'session', state: 'applied', revision: 2, ids: ['ai-study-op-0', 'ma', 'ma', 'rsi'] };
    expect(validateStudyReceipt({ ...applied, calculation: { 'ai-study-op-0': 'ready', ma: 'pending' } }, operations).calculation).toEqual({ 'ai-study-op-0': 'ready', ma: 'pending' });
    for (const calculation of [undefined, { 'ai-study-op-0': 'ready' }, { 'ai-study-op-0': 'ready', ma: 'pending', rsi: 'ready' }]) {
      expect(() => validateStudyReceipt({ ...applied, ...(calculation ? { calculation } : {}) }, operations)).toThrow('invalid_input');
    }
    expect(validateStudyReceipt({ ...applied, state: 'committed' }, operations).state).toBe('committed');
  });
  it('shares one pane ID format and one style family order', () => {
    const id = newStudyPaneId();
    expect(isDetachedStudyPaneId(id) && isStudyPaneId(id) && isStudyPaneId('main')).toBe(true);
    for (const bad of ['new', 'pane:', 'pane:'.padEnd(257, 'x'), 'Pane:1', 1, null]) expect(isStudyPaneId(bad)).toBe(false);
    expect(isDetachedStudyPaneId('main')).toBe(false);
    // Plain HTTP pages have no crypto.randomUUID; pane IDs must still be made there.
    const prototype = Object.getPrototypeOf(crypto);
    const randomUUID = Object.getOwnPropertyDescriptor(prototype, 'randomUUID');
    Object.defineProperty(prototype, 'randomUUID', { value: undefined, configurable: true });
    try {
      const insecure = newStudyPaneId();
      expect(isDetachedStudyPaneId(insecure) && insecure !== newStudyPaneId()).toBe(true);
    } finally {
      if (randomUUID) Object.defineProperty(prototype, 'randomUUID', randomUUID);
    }
    expect(studyStyleGroups({ fills: { fill_0: { visible: true } }, plots: { plot_0: { color: '#ff0000' } } }).map(group => `${group.family}.${group.id}`)).toEqual(['plots.plot_0', 'fills.fill_0']);
  });
});

describe('retired study documents', () => {
  it('names only older payload versions as retired, never newer or malformed ones', async () => {
    const { isRetiredStudyDocument } = await import('../src/index');
    const envelope = (payload: unknown) => ({ version: 1, documentId: 'd', chartId: 'c', revision: 2, payload });
    expect(isRetiredStudyDocument(envelope({ version: 2, panes: [] }))).toBe(true);
    expect(isRetiredStudyDocument(envelope({ version: 1 }))).toBe(true);
    for (const value of [envelope({ version: 3 }), envelope({ version: 4 }), envelope({ version: '2' }), envelope(null), { version: 2, payload: { version: 2 } }, null, []]) {
      expect(isRetiredStudyDocument(value)).toBe(false);
    }
  });
});

describe('custom study descriptors', () => {
  const custom: StudyCapability = {
    kind: 'study', id: 'ScaledClose@custom-1', title: 'Scaled Close', placement: 'pane',
    inputs: [{ id: 'factor', title: 'Factor', kind: 'number', writable: true, default: 2, min: 0 }, { id: 'mode', title: 'Mode', kind: 'enum', writable: true, choices: ['a', 'b'] }, { id: 'f1', title: 'F1', kind: 'boolean', writable: true }, { id: 'f2', title: 'F2', kind: 'boolean', writable: true }, { id: 'f3', title: 'F3', kind: 'boolean', writable: true }],
    plots: [{ id: 'plot_0', title: 'Scaled', fields: [{ id: 'color', title: 'Color', kind: 'color', writable: true }, { id: 'visible', title: 'Visible', kind: 'boolean', writable: true }] }],
  };
  it('accepts custom ids only with the chart descriptor and validates their values the same way', () => {
    const add = { action: 'add', studyId: custom.id, inputs: { factor: 3, mode: 'b' }, styles: { plots: { plot_0: { color: '#123456' } } } };
    expect(() => validateStudyOperations([add])).toThrow('unsupported');
    expect(validateStudyOperations([add], [custom])).toEqual([add]);
    for (const inputs of [{ factor: -1 }, { mode: 'c' }, { factor: '3' }]) expect(() => validateStudyOperations([{ ...add, inputs }], [custom])).toThrow('invalid_input');
    expect(() => validateStudyOperations([{ ...add, inputs: { other: 1 } }], [custom])).toThrow('unsupported');
    expect(() => validateStudyTargetPatch({ styles: { plots: { plot_0: { width: 2 } } } }, custom.id, [custom])).toThrow('unsupported');
    expect(validateStudyInputs({ factor: 0 }, custom.id, [custom])).toEqual({ factor: 0 });
    expect(validateStudyStyles({ plots: { plot_0: { visible: false } } }, custom.id, [custom])).toEqual({ plots: { plot_0: { visible: false } } });
    const batch = { version: 1, operationId: 'op', binding, chartId: 'primary', expectedRevision: 1, operations: [add] };
    expect(() => validateStudyBatch(batch)).toThrow('unsupported');
    expect(validateStudyBatch(batch, [custom])).toEqual(batch);
    // A descriptor cannot widen a built-in id, certified or not.
    expect(() => validateStudyOperations([{ action: 'add', studyId: 'Volume@chart-studies-1' }], [{ ...custom, id: 'Volume@chart-studies-1' }])).toThrow('unsupported');
    expect(() => validateStudyTargetPatch({ inputs: { factor: 3 } }, STUDY_IDS[0], [{ ...custom, id: STUDY_IDS[0] }])).toThrow('unsupported');
  });
  it('saves custom indicator records in version 3 documents and lists them', () => {
    const studies = [...payload.studies, { id: 'custom', source: { type: 'java', studyId: custom.id } }];
    const saved = { ...document, payload: { ...payload, studies, panes: [{ ...payload.panes[0]!, sources: ['main', 'manual-volume', 'custom'] }, payload.panes[1]!] } };
    expect(validateStudyDocument(saved)).toEqual(saved);
    const row = { id: 'custom', studyId: custom.id, title: 'Scaled Close', editable: true, locked: false, paneId: 'main', paneIndex: 0, inputs: { factor: 2 } };
    const list = { studies: [row], total: 1, revision: 1 };
    expect(validateStudyList(list, { offset: 0, limit: 20 })).toEqual(list);
    expect(validateStudyList(list, { offset: 0, limit: 20 }, [custom])).toEqual(list);
    expect(() => validateStudyList(list, { offset: 0, limit: 20 }, [])).toThrow('invalid_input');
    expect(validateStudyList({ ...list, studies: [{ ...row, editable: false }] }, { offset: 0, limit: 20 }, [])).toBeTruthy();
    expect(() => validateStudyList({ ...list, studies: [{ ...row, studyId: 'Volume@chart-studies-1' }] }, { offset: 0, limit: 20 }, [custom])).toThrow('invalid_input');
  });
  it('lists custom descriptors in the catalog and the studies.apply schema', () => {
    expect(chartCapabilityCatalog({ kind: 'study', search: 'scaled' })).toMatchObject({ entries: [] });
    expect(chartCapabilityCatalog({ kind: 'study', search: 'scaled' }, { studies: [custom] })).toMatchObject({ entries: [{ kind: 'study', id: custom.id, title: 'Scaled Close', summary: 'Study in a separate pane' }] });
    expect(chartCapabilityCatalog({ id: custom.id }, { studies: [custom] })).toMatchObject({ capability: custom });
    expect(() => chartCapabilityCatalog({ id: custom.id }, { kinds: ['drawing'], studies: [custom] })).toThrow('unsupported');
    expect(JSON.stringify(studyInputSchema().jsonSchema)).toBe(JSON.stringify(studyInput.jsonSchema));
    const schema = studyInputSchema([custom]);
    const operations = [{ action: 'add', studyId: custom.id, inputs: { factor: 1, mode: 'a', f1: true, f2: true, f3: true } }];
    expect(() => studyInput.parse({ expectedRevision: 0, operations })).toThrow();
    expect(schema.parse({ expectedRevision: 0, operations })).toEqual({ expectedRevision: 0, operations });
  });
});

/** A study owner whose custom descriptors the test changes after the commands are installed. */
function studyOwner(described?: () => readonly StudyCapability[]): ChartStudyApi & { added: string[] } {
  const added: string[] = [];
  const context = { version: 1 as const, chartId: 'primary', documentId: 'session', revision: 0, panes: [{ id: 'main', position: 0 }], limits: { studies: 16, panes: 8 }, count: 0, paneCount: 1, comparisons: [] };
  const saved = document as StudyDocument;
  return {
    version: 2, added,
    ...(described ? { studyCapabilities: described } : {}),
    context: () => context,
    list: () => ({ studies: [], total: 0, revision: 0 }),
    exportDocument: () => saved,
    restoreDocument() {},
    updatePersistenceRevision() {},
    prepare(batch) {
      for (const operation of batch.operations) if (operation.action === 'add') added.push(operation.studyId);
      return { operationId: batch.operationId, chartId: batch.chartId, binding: batch.binding, document: saved, ids: [] };
    },
    acquireMutationLease: () => () => {},
    commit: operationId => ({ version: 1, operationId, chartId: 'primary', documentId: 'session', state: 'committed', revision: 1, ids: [] }),
    discard() {},
    invalidate() {},
    subscribe: () => () => {},
    destroy() {},
  };
}

describe('studies.apply follows the chart\'s custom studies', () => {
  const custom: StudyCapability = {
    kind: 'study', id: 'ScaledClose@custom-1', title: 'Scaled Close', placement: 'pane',
    inputs: [{ id: 'factor', title: 'Factor', kind: 'number', writable: true, default: 2, min: 0, max: 100 }],
    plots: [{ id: 'plot_0', title: 'Scaled', fields: [{ id: 'color', title: 'Color', kind: 'color', writable: true }] }],
  };
  const policy = { effects: ['read', 'mutation'] as const };
  const add = (studyId: string) => ({ expectedRevision: 0, operations: [{ action: 'add', studyId, inputs: { factor: 3 } }] });
  const applySchema = (sdk: { capabilities(): { commands: { name: string; input: unknown }[] } }) =>
    JSON.stringify(sdk.capabilities().commands.find(command => command.name === 'studies.apply')!.input);

  it('advertises and accepts custom studies registered after installation, and advances the revision once per change', async () => {
    let registered: readonly StudyCapability[] = [];
    const owner = studyOwner(() => registered);
    const { sdk } = createTestAutomation({ policy: { effects: [...policy.effects] }, owners: { binding: () => binding, studies: owner } });
    try {
      const installed = sdk.capabilities().revision;
      expect(applySchema(sdk)).not.toContain(custom.id);
      await expect(sdk.execute('studies.apply', add(custom.id))).rejects.toMatchObject({ code: 'unsupported' });

      registered = [custom];
      const advertised = sdk.capabilities().revision;
      expect(advertised).toBeGreaterThan(installed);
      expect(applySchema(sdk)).toContain(custom.id);
      expect(sdk.capabilities().revision, 'an unchanged list keeps the revision').toBe(advertised);
      await expect(sdk.execute('studies.apply', add(custom.id))).resolves.toMatchObject({ state: 'committed' });
      expect(owner.added).toEqual([custom.id]);

      registered = [];
      expect(sdk.capabilities().revision).toBeGreaterThan(advertised);
      expect(applySchema(sdk)).not.toContain(custom.id);
      await expect(sdk.execute('studies.apply', add(custom.id))).rejects.toMatchObject({ code: 'unsupported' });
      expect(applySchema(sdk), 'without custom studies the schema is the certified one').toBe(JSON.stringify(studyInput.jsonSchema));
    } finally { sdk.destroy(); }
  });

  it('keeps the certified schema and revision for owners that describe no custom studies', async () => {
    const { sdk } = createTestAutomation({ policy: { effects: [...policy.effects] }, owners: { binding: () => binding, studies: studyOwner() } });
    try {
      const revision = sdk.capabilities().revision;
      expect(applySchema(sdk)).toBe(JSON.stringify(studyInput.jsonSchema));
      await expect(sdk.execute('studies.apply', { expectedRevision: 0, operations: [{ action: 'add', studyId: STUDY_IDS[0] }] })).resolves.toMatchObject({ state: 'committed' });
      expect(sdk.capabilities().revision).toBe(revision);
    } finally { sdk.destroy(); }
  });
});

