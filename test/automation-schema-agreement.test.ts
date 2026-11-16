import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { nativeCommands } from '../src/sdk/native-commands.js';
import { field } from '../src/sdk/schema.js';
import { createFakeDrawingOwner } from '../src/sdk/testing-drawing-owner.js';
import { DRAWING_CATALOG_TYPES, LIMITS } from '../src/contracts.js';
import { STUDY_IDS, STUDY_LIMITS } from '../src/studies.js';
import { initialWorkspace } from '../src/workspace.js';
import { CHART_CAPABILITIES } from '../src/generated/capability-snapshot.js';

/**
 * The JSON Schema a model is given and the parser that judges its call must agree. Ajv, an independent JSON
 * Schema implementation, checks each fixture against the advertised schema; the command's own parser checks the
 * same fixture. An accepted input must always match the schema. An input the schema allows but the parser rejects
 * must name the rule a schema cannot express (`beyondSchema`), so every gap is deliberate and documented.
 */
type Fixture = { readonly title: string; readonly input: unknown; readonly accepted: boolean; readonly beyondSchema?: string };

const owners = {
  binding: () => { throw new Error('unused'); },
  drawings: { catalogVersion: 2, drawingSettingsVersion: 1, listGroups() {}, inspectDrawing() {}, inspectVersion: 1 },
  studies: { inspectStudy() {}, inspectVersion: 1 },
  settings: {},
  workspace: {},
} as unknown as Parameters<typeof nativeCommands>[0];
const commands = new Map<string, ReturnType<typeof nativeCommands>[number]>(nativeCommands(owners).map(command => [command.name, command]));
const ajv = new Ajv({ strict: true, allowUnionTypes: true });

describe('field options agree with the advertised schema', () => {
  it('compares unique array items by JSON value, including nested record keys in any order', () => {
    const item = field.record(field.array(field.number(), { maxItems: 2 }), { maxKeys: 2 });
    const unique = field.array(item, { maxItems: 2, uniqueItems: true });
    const validate = ajv.compile(unique.jsonSchema);
    const first = { a: [1, 2], b: [3] };
    const duplicate = [first, { b: [3], a: [1, 2] }];
    const distinct = [first, { b: [3], a: [2, 1] }];

    expect(validate(duplicate)).toBe(false);
    expect(() => unique.parse(duplicate)).toThrow(expect.objectContaining({ details: { reason: 'repeated item' } }));
    expect(validate(distinct)).toBe(true);
    expect(unique.parse(distinct)).toEqual(distinct);
  });

  it.each([field.string, field.text])('matches string patterns in Unicode mode', makeField => {
    const patterned = makeField(1, { pattern: /^.$/ });
    const validate = ajv.compile(patterned.jsonSchema);

    expect(validate('📈')).toBe(true);
    expect(patterned.parse('📈')).toBe('📈');
    expect(validate('📈📉')).toBe(false);
    expect(() => patterned.parse('📈📉')).toThrow(expect.objectContaining({ details: { reason: 'too long' } }));
    expect(() => makeField(8, { pattern: /^\a$/ })).toThrow('Unicode-compatible');
  });

  it('counts Unicode characters toward text length bounds', () => {
    const bounded = field.text(2, { minLength: 2 });
    const validate = ajv.compile(bounded.jsonSchema);

    expect(validate('📈')).toBe(false);
    expect(() => bounded.parse('📈')).toThrow(expect.objectContaining({ details: { reason: 'too short' } }));
    expect(validate('📈📉')).toBe(true);
    expect(bounded.parse('📈📉')).toBe('📈📉');
  });

  it('counts only provided fields toward the object minimum', () => {
    const patch = field.object({ constructor: field.optional(field.string()) }, { minProperties: 1 });
    const validate = ajv.compile(patch.jsonSchema);

    expect(validate({})).toBe(false);
    expect(() => patch.parse({})).toThrow(expect.objectContaining({ details: { reason: 'too few fields' } }));
    expect(patch.parse({ constructor: 'value' })).toEqual({ constructor: 'value' });
  });
});

const drawings = (...operations: unknown[]) => ({ operations });
const type = DRAWING_CATALOG_TYPES[0];
const create = { action: 'create', type, points: [{ time: 1, price: 2 }, { time: 3, price: 4 }] };

describe('drawing schemas follow the installed owner', () => {
  it.each([
    { catalog: {}, extended: false, settings: false },
    { catalog: { catalogVersion: 2 as const }, extended: true, settings: false },
    { catalog: { catalogVersion: 2 as const, drawingSettingsVersion: 1 as const }, extended: true, settings: true },
  ])('advertises the negotiated operation shapes for $catalog', ({ catalog, extended, settings }) => {
    const owner = createFakeDrawingOwner();
    const command = nativeCommands({ binding: owner.binding, drawings: { ...owner, ...catalog } })
      .find(command => command.name === 'drawings.apply');
    if (!command) throw new Error('Missing drawings.apply');
    const validate = ajv.compile(command.input.jsonSchema);
    const cases = [
      { operations: drawings(create), supported: true },
      { operations: drawings({ ...create, type: 'arrow' }), supported: extended },
      { operations: drawings({ action: 'update', id: 'd', points: [{ time: 1 }, { time: 2 }, { time: 3 }] }), supported: extended },
      { operations: drawings({ action: 'group.create', name: 'Group', ids: ['a', 'b'] }), supported: extended },
      { operations: drawings({ ...create, ref: 'first' }), supported: settings },
      { operations: drawings({ ...create, settings: { 'line.width': 2 } }), supported: settings },
      { operations: drawings({ action: 'update', id: 'd', reset: ['line.width'] }), supported: settings },
    ];

    for (const { operations, supported } of cases) {
      expect(validate(operations), JSON.stringify(operations)).toBe(supported);
      if (supported) expect(command.input.parse(operations)).toEqual(operations);
      else expect(() => command.input.parse(operations)).toThrow();
    }
  });
});

const studies = (...operations: unknown[]) => ({ expectedRevision: 0, operations });
const study = CHART_CAPABILITIES.find(entry => entry.kind === 'study' && entry.inputs.length)!;
const studyInput = study.kind === 'study' ? study.inputs[0]! : undefined!;
const selection = { symbol: 'AAPL', symbolId: 'NASDAQ:AAPL', instrumentType: 'stock', interval: '1D' };
const single = initialWorkspace('ws', selection);
const two = { ...single, layout: 'two_columns', slots: ['ws:primary', 'ws:second'], charts: [...single.charts, { id: 'ws:second', documentId: 'ws-second', selection }] };

const fixtures: Record<string, readonly Fixture[]> = {
  'drawings.apply': [
    { title: 'create with two points', input: drawings(create), accepted: true },
    { title: 'create with a reference used by a group', input: drawings({ ...create, ref: 'first' }, { action: 'group.create', name: 'Group', ids: ['ref:first', 'other'] }), accepted: true },
    { title: 'update every style field', input: drawings({ action: 'update', id: 'd', style: { color: '#AABBcc', lineWidth: 8, lineStyle: 'dashed', fillOpacity: 0.5, text: '' } }), accepted: true },
    { title: 'update points, settings and a reset', input: drawings({ action: 'update', id: 'd', points: [{ price: 1 }], settings: { 'text.size': 12 }, reset: ['line.color'] }), accepted: true },
    { title: 'whitespace-only drawing ID', input: drawings({ action: 'delete', id: ' ' }), accepted: true },
    { title: 'every group action', input: drawings(
      { action: 'group.rename', id: 'g', name: 'Renamed' },
      { action: 'group.members', id: 'g', add: ['a'], remove: ['b'] },
      { action: 'group.visibility', id: 'g', visible: false },
      { action: 'group.lock', id: 'g', locked: true, confirmUserIntent: true },
      { action: 'group.remove', id: 'g' },
    ), accepted: true },
    { title: 'four points', input: drawings({ ...create, points: [{ time: 1 }, { time: 2 }, { time: 3 }, { time: 4 }] }), accepted: false },
    { title: 'a point with neither time nor price', input: drawings({ ...create, points: [{}] }), accepted: false },
    { title: 'line width above 8', input: drawings({ action: 'update', id: 'd', style: { lineWidth: 9 } }), accepted: false },
    { title: 'fractional line width', input: drawings({ action: 'update', id: 'd', style: { lineWidth: 1.5 } }), accepted: false },
    { title: 'fill opacity above 1', input: drawings({ action: 'update', id: 'd', style: { fillOpacity: 2 } }), accepted: false },
    { title: 'named colour', input: drawings({ action: 'update', id: 'd', style: { color: 'red' } }), accepted: false },
    { title: 'style text over 2,000 characters', input: drawings({ action: 'update', id: 'd', style: { text: 'x'.repeat(2001) } }), accepted: false },
    { title: 'update with nothing to change', input: drawings({ action: 'update', id: 'd' }), accepted: false },
    { title: 'model-provided unlock', input: drawings({ action: 'delete', id: 'locked', unlock: true }), accepted: false },
    { title: 'unknown action', input: drawings({ action: 'explode' }), accepted: false },
    { title: 'empty batch', input: drawings(), accepted: false },
    { title: 'oversized batch', input: drawings(...Array.from({ length: LIMITS.operationsPerBatch + 1 }, () => ({ action: 'delete', id: 'd' }))), accepted: false },
    { title: 'group of one', input: drawings({ action: 'group.create', name: 'Group', ids: ['a'] }), accepted: false },
    { title: 'repeated group member', input: drawings({ action: 'group.create', name: 'Group', ids: ['a', 'a'] }), accepted: false },
    { title: 'lock without user intent', input: drawings({ action: 'group.lock', id: 'g', locked: true }), accepted: false },
    { title: 'malformed reference name', input: drawings({ ...create, ref: '1st' }), accepted: false },
    { title: 'empty settings', input: drawings({ action: 'update', id: 'd', settings: {} }), accepted: false, beyondSchema: 'settings must name at least one field' },
    { title: 'reference to an undeclared drawing', input: drawings({ action: 'group.create', name: 'Group', ids: ['ref:missing', 'other'] }), accepted: false, beyondSchema: 'references must name a drawing created earlier in the batch' },
    { title: 'member both added and removed', input: drawings({ action: 'group.members', id: 'g', add: ['a'], remove: ['a'] }), accepted: false, beyondSchema: 'a member cannot be added and removed together' },
    { title: 'settings on create and a reset on a later update', input: drawings({ ...create, settings: { a: 1 } }, { action: 'update', id: 'd', reset: ['a'], settings: { a: 1 } }), accepted: true },
  ],
  'studies.apply': [
    { title: 'add with defaults', input: studies({ action: 'add', studyId: STUDY_IDS[0] }), accepted: true },
    { title: 'add with an input and a new pane', input: studies({ action: 'add', studyId: study.id, inputs: { [studyInput.id]: studyInput.default ?? 1 }, placement: { paneId: 'new', scale: 'own' } }), accepted: true },
    { title: 'update inputs', input: studies({ action: 'update', id: 's', inputs: { length: 20 } }), accepted: true },
    { title: 'comparisons', input: studies({ action: 'add_comparison', symbolId: 'AAPL', scale: 'own', normalization: 'raw' }, { action: 'remove_comparison', id: 'c' }, { action: 'remove', id: 's' }), accepted: true },
    { title: 'unknown study', input: studies({ action: 'add', studyId: 'Not a study' }), accepted: false },
    { title: 'update with nothing to change', input: studies({ action: 'update', id: 's' }), accepted: false },
    { title: 'position past the last pane', input: studies({ action: 'add', studyId: STUDY_IDS[0], placement: { paneId: 'new', scale: 'own', position: STUDY_LIMITS.panes } }), accepted: false },
    { title: 'negative revision', input: { expectedRevision: -1, operations: [{ action: 'remove', id: 's' }] }, accepted: false },
    { title: 'oversized batch', input: studies(...Array.from({ length: STUDY_LIMITS.operationsPerBatch + 1 }, () => ({ action: 'remove', id: 's' }))), accepted: false },
    { title: 'non-scalar input value', input: studies({ action: 'update', id: 's', inputs: { length: [20] } }), accepted: false },
    { title: 'malformed pane ID', input: studies({ action: 'add', studyId: STUDY_IDS[0], placement: { paneId: 'bogus', scale: 'own' } }), accepted: false, beyondSchema: 'pane IDs follow the native pane format' },
    { title: 'main scale outside the main pane', input: studies({ action: 'add', studyId: STUDY_IDS[0], placement: { paneId: 'new', scale: 'main' } }), accepted: false, beyondSchema: 'the main scale lives only in the main pane' },
    { title: 'input the study does not declare', input: studies({ action: 'add', studyId: study.id, inputs: { notAnInput: 1 } }), accepted: false, beyondSchema: 'inputs are checked against the chosen study' },
  ],
  'settings.apply': [
    { title: 'chart type', input: { settings: { chartType: 'line' } }, accepted: true },
    { title: 'scale flags', input: { settings: { 'scale.inverted': true, 'scale.autoScale': false, 'scale.mode': 'log' } }, accepted: true },
    { title: 'no settings', input: { settings: {} }, accepted: false },
    { title: 'unknown setting', input: { settings: { theme: 'dark' } }, accepted: false },
    { title: 'unknown chart type', input: { settings: { chartType: 'pie' } }, accepted: false },
  ],
  'workspace.apply': [
    { title: 'single chart', input: single, accepted: true },
    { title: 'two columns', input: two, accepted: true },
    { title: 'unknown version', input: { ...single, version: 2 }, accepted: false },
    { title: 'unknown layout', input: { ...single, layout: 'grid' }, accepted: false },
    { title: 'repeated slot', input: { ...two, slots: ['ws:primary', 'ws:primary'] }, accepted: false },
    { title: 'missing sync flag', input: { ...single, sync: { crosshair: true, time: true } }, accepted: false },
    { title: 'primary chart not first', input: { ...two, charts: [...two.charts].reverse() }, accepted: false, beyondSchema: 'the primary chart comes first and keeps the workspace document' },
    { title: 'slot count not matching the layout', input: { ...two, layout: 'single' }, accepted: false, beyondSchema: 'the layout decides how many slots are filled' },
    { title: 'slot naming an unknown chart', input: { ...two, slots: ['ws:primary', 'ws:missing'] }, accepted: false, beyondSchema: 'slots name charts in the document' },
  ],
};

function parses(name: string, input: unknown): boolean {
  try {
    commands.get(name)!.input.parse(input);
    return true;
  } catch {
    return false;
  }
}

describe('advertised native schemas agree with their parsers', () => {
  it('every native command advertises a valid strict JSON Schema', () => {
    for (const command of commands.values()) expect(() => ajv.compile(command.input.jsonSchema), command.name).not.toThrow();
  });

  for (const [name, cases] of Object.entries(fixtures)) {
    describe(name, () => {
      const validate = () => ajv.compile(commands.get(name)!.input.jsonSchema);
      it.each(cases)('$title', ({ input, accepted, beyondSchema }) => {
        const schemaAllows = validate()(input) === true;
        const parserAccepts = parses(name, input);
        expect(parserAccepts, 'parser decision').toBe(accepted);
        if (parserAccepts) expect(schemaAllows, 'an accepted input must match the advertised schema').toBe(true);
        else if (beyondSchema) expect(schemaAllows, `"${beyondSchema}" is listed as beyond the schema`).toBe(true);
        else expect(schemaAllows, 'the schema allows an input the parser rejects; tighten the schema or name the rule').toBe(false);
      });
    });
  }
});
