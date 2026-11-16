import { expect, it, vi } from 'vitest';
import { pageSchema } from '../src/sdk/page-schema.js';
import { LIMITS, validateOperations } from '../src/contracts.js';
import { STUDY_LIMITS, validateStudyRead } from '../src/studies.js';
import { drawingInput, studyInput } from '../src/sdk/native-schemas.js';

const drawingInputSchema = drawingInput(2, 1).jsonSchema;

it.each([LIMITS.summariesPerPage, STUDY_LIMITS.summariesPerPage])('advertises and enforces the same page maximum %i', maximum => {
  const schema = pageSchema(maximum);
  expect(schema.jsonSchema.properties.limit.maximum).toBe(maximum);
  for (const limit of [1, maximum]) expect(schema.parse({ offset: 0, limit }).limit).toBe(limit);
  for (const limit of [0, maximum + 1, 1.5, Infinity]) expect(() => schema.parse({ offset: 0, limit })).toThrow();
  expect(() => schema.parse({ offset: -1, limit: 1 })).toThrow();
  expect(() => schema.parse({ offset: 0, limit: 1, unexpected: true })).toThrow();
});
it('keeps study pagination aligned with the native protocol validator', () => {
  const schema = pageSchema(STUDY_LIMITS.summariesPerPage);
  for (const limit of [1, 20, 21]) {
    const succeeds = (parse: (input: unknown) => unknown) => { try { parse({ offset: 0, limit }); return true; } catch { return false; } };
    expect(succeeds(schema.parse)).toBe(succeeds(validateStudyRead));
  }
});
it('derives advertised batch sizes from the same native limits', () => {
  expect(drawingInputSchema.properties.operations).toMatchObject({ maxItems: LIMITS.operationsPerBatch });
  expect(studyInput.jsonSchema.properties.operations).toMatchObject({ maxItems: STUDY_LIMITS.operationsPerBatch });
  const operation = { action: 'delete', id: 'drawing' };
  expect(validateOperations(Array.from({ length: LIMITS.operationsPerBatch }, () => operation))).toHaveLength(LIMITS.operationsPerBatch);
  expect(() => validateOperations(Array.from({ length: LIMITS.operationsPerBatch + 1 }, () => operation))).toThrow();
});

it('matches group creation and lock metadata to accepted operations', () => {
  /** The advertised properties of one operation variant, found by its `action` constant. */
  const variant = (action: string): Record<string, unknown> => {
    const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
    const found = drawingInputSchema.properties.operations.items.oneOf
      .map(schema => schema.properties)
      .find((properties): properties is Record<string, unknown> => isObject(properties) && isObject(properties.action) && properties.action.const === action);
    if (!found) throw new Error(`No ${action} variant`);
    return found;
  };
  expect(variant('group.create').ids).toMatchObject({ minItems: 2 });
  expect(() => validateOperations([{ action: 'group.create', name: 'Group', ids: ['a'] }], 2)).toThrow();
  expect(validateOperations([{ action: 'group.create', name: 'Group', ids: ['a', 'b'] }], 2)).toHaveLength(1);
  expect(variant('group.lock').locked).toEqual({ type: 'boolean' });
  for (const locked of [true, false]) expect(validateOperations([{ action: 'group.lock', id: 'group', locked, confirmUserIntent: true }], 2)).toHaveLength(1);
});

it('derives the advertised object schema and parser from one declaration', async () => {
  const { field, objectSchema } = await import('../src/sdk/schema.js');
  const schema = objectSchema({ id: field.string(8), count: field.integer({ minimum: 1, maximum: 3 }), tag: field.optional(field.oneOf(['a', 'b'])) });
  expect(schema.jsonSchema).toEqual({
    type: 'object', additionalProperties: false, required: ['id', 'count'],
    properties: { id: { type: 'string', minLength: 1, maxLength: 8 }, count: { type: 'integer', minimum: 1, maximum: 3 }, tag: { enum: ['a', 'b'] } },
  });
  expect(schema.parse({ id: 'x', count: 2 })).toEqual({ id: 'x', count: 2 });
  expect('tag' in schema.parse({ id: 'x', count: 2, tag: undefined })).toBe(false);
  expect(() => schema.parse({ id: 'x', count: 4 })).toThrow('limit_exceeded');
  for (const invalid of [{ id: ' ', count: 1 }, { id: 'x', count: 0 }, { id: 'x', count: 1, tag: 'c' }, { id: 'x', count: 1, extra: 1 }, { count: 1 }]) {
    expect(() => schema.parse(invalid)).toThrow('invalid_input');
  }
});

it('installs exactly the reserved native command names', async () => {
  const { nativeCommands } = await import('../src/sdk/native-commands.js');
  const { NATIVE_COMMAND_NAMES } = await import('../src/sdk/builtin-contracts.js');
  const owners = { binding: () => { throw new Error('unused'); }, drawings: { listGroups() {}, inspectDrawing() {}, inspectVersion: 1 }, studies: { inspectStudy() {}, inspectVersion: 1 }, settings: {}, workspace: {} } as unknown as Parameters<typeof nativeCommands>[0];
  expect(nativeCommands(owners).map(command => command.name).sort()).toEqual([...NATIVE_COMMAND_NAMES].sort());
});

it('rejects invalid native operations before dispatching to the owner', async () => {
  const { createChartAutomation, installNativeAutomationCommands } = await import('../src/sdk/index.js');
  const target = { id: 'chart', generation: 0 };
  const sdk = createChartAutomation({ currentTarget: () => target });
  const prepare = vi.fn();
  installNativeAutomationCommands(sdk, { binding: () => { throw new Error('unused'); }, drawings: { prepare } as unknown as import('../src/contracts.js').ChartDrawingApi });
  await expect(sdk.execute('drawings.apply', { operations: [{ action: 'explode' }] }, { requestId: 'r', target })).rejects.toThrow();
  await expect(sdk.execute('capabilities.query', { unexpected: true }, { requestId: 'r', target })).rejects.toThrow('invalid_input');
  expect(prepare).not.toHaveBeenCalled();
  sdk.destroy();
});
