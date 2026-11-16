import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ChartCommandError, createChartAutomation, defaultToolName, defineCommand, field, objectSchema,
  type AutomationCommand, type AutomationHost, type AutomationTarget,
} from '../src/sdk/index.js';

let target: AutomationTarget = { id: 'chart', generation: 0 };
const host: AutomationHost = { currentTarget: () => target };

const double = defineCommand({
  name: 'example.double',
  effect: 'read',
  description: 'Double a number.',
  input: { value: field.number({ maximum: 1000 }) },
  output: { value: field.number() },
  execute: ({ value }) => ({ value: value * 2 }),
});

describe('field builders', () => {
  it('advertise and parse the same bounded shapes', () => {
    const schema = objectSchema({
      flag: field.boolean(),
      kind: field.literal('zone'),
      tags: field.array(field.string(8), { maxItems: 2 }),
      point: field.object({ time: field.integer({ minimum: 0 }), price: field.number() }),
      note: field.optional(field.nullable(field.text(10))),
    });
    expect(schema.jsonSchema.required).toEqual(['flag', 'kind', 'tags', 'point']);
    expect(schema.jsonSchema.properties.tags).toEqual({ type: 'array', items: { type: 'string', minLength: 1, maxLength: 8 }, maxItems: 2 });
    expect(schema.parse({ flag: true, kind: 'zone', tags: ['a'], point: { time: 1, price: 2.5 }, note: null }))
      .toEqual({ flag: true, kind: 'zone', tags: ['a'], point: { time: 1, price: 2.5 }, note: null });
    expect(() => schema.parse({ flag: 1, kind: 'zone', tags: [], point: { time: 1, price: 1 } })).toThrow('invalid_input');
    expect(() => schema.parse({ flag: true, kind: 'zone', tags: ['a', 'b', 'c'], point: { time: 1, price: 1 } })).toThrow('limit_exceeded');
    expect(() => schema.parse({ flag: true, kind: 'zone', tags: [], point: { time: 1, price: 1, extra: 1 } })).toThrow('invalid_input');
    expect(() => schema.parse({ flag: true, kind: 'zone', tags: [], point: { time: 1, price: Number.NaN } })).toThrow('invalid_input');
  });
  it('requires arrays to be bounded', () => {
    expect(() => field.array(field.boolean(), { maxItems: 0 })).toThrow(expect.objectContaining({ code: 'invalid_input' }));
    expect(() => field.array(field.boolean(), { maxItems: 2, minItems: 3 })).toThrow(expect.objectContaining({ code: 'invalid_input' }));
  });
  it('infers handler input and output types', () => {
    defineCommand({
      name: 'example.types', effect: 'read', description: 'Types.',
      input: { symbol: field.string(8), limit: field.optional(field.integer({ minimum: 1 })) },
      output: { ok: field.boolean() },
      execute(input) {
        expectTypeOf(input.symbol).toEqualTypeOf<string>();
        expectTypeOf(input.limit).toEqualTypeOf<number | undefined>();
        return { ok: true };
      },
    });
  });
});

describe('field descriptions', () => {
  it('emit descriptions into JSON Schema, including nested objects, arrays and unions', () => {
    const schema = objectSchema({
      symbol: field.string(8).describe('Ticker symbol.'),
      limit: field.optional(field.integer({ minimum: 1 })).describe('Rows to return.'),
      note: field.nullable(field.text(10)).describe('Optional note.'),
      points: field.array(field.object({ time: field.integer().describe('UTC ms.') }).describe('A point.'), { maxItems: 2 }).describe('Anchor points.'),
      shape: field.union('kind', { line: { price: field.number().describe('Price level.') } }).describe('The shape.'),
      levels: field.record(field.number().describe('A level.'), { maxKeys: 4 }).describe('Named levels.'),
    });
    expect(schema.jsonSchema.properties.symbol).toEqual({ type: 'string', minLength: 1, maxLength: 8, description: 'Ticker symbol.' });
    expect(schema.jsonSchema.properties.limit).toEqual({ type: 'integer', minimum: 1, description: 'Rows to return.' });
    expect(schema.jsonSchema.required).toEqual(['symbol', 'note', 'points', 'shape', 'levels']);
    expect(schema.jsonSchema.properties.note).toEqual({ anyOf: [{ type: 'string', maxLength: 10 }, { type: 'null' }], description: 'Optional note.' });
    expect(schema.jsonSchema.properties.points).toEqual({
      type: 'array', maxItems: 2, description: 'Anchor points.',
      items: { type: 'object', properties: { time: { type: 'integer', description: 'UTC ms.' } }, required: ['time'], additionalProperties: false, description: 'A point.' },
    });
    expect(schema.jsonSchema.properties.shape).toEqual({
      description: 'The shape.',
      oneOf: [{ type: 'object', properties: { kind: { const: 'line' }, price: { type: 'number', description: 'Price level.' } }, required: ['kind', 'price'], additionalProperties: false }],
    });
    expect(schema.jsonSchema.properties.levels).toMatchObject({ additionalProperties: { type: 'number', description: 'A level.' }, description: 'Named levels.' });
    expect(schema.parse({ symbol: 'AAPL', note: null, points: [], shape: { kind: 'line', price: 1 }, levels: {} }))
      .toEqual({ symbol: 'AAPL', note: null, points: [], shape: { kind: 'line', price: 1 }, levels: {} });
  });
  it('leave undescribed schemas unchanged and keep the original field untouched', () => {
    const base = field.integer({ maximum: 3 });
    const described = base.describe('Count.');
    expect(base.jsonSchema).toEqual({ type: 'integer', maximum: 3 });
    expect('description' in base.jsonSchema).toBe(false);
    expect(described.parse(2)).toBe(2);
    expect(() => described.parse(4)).toThrow('limit_exceeded');
    expect(() => base.describe('')).toThrow('Field descriptions');
    expect(() => base.describe('x'.repeat(1001))).toThrow('Field descriptions');
  });
  it('keep literal, optional and inferred types', () => {
    const kind = field.literal('zone').describe('Kind.');
    expectTypeOf(kind.parse).returns.toEqualTypeOf<'zone'>();
    expectTypeOf(kind.jsonSchema.const).toEqualTypeOf<'zone'>();
    expectTypeOf(kind.jsonSchema.description).toEqualTypeOf<string>();
    const choice = field.oneOf(['a', 'b']).describe('Choice.');
    expectTypeOf(choice.parse).returns.toEqualTypeOf<'a' | 'b'>();
    const optional = field.optional(field.number()).describe('Maybe.');
    expectTypeOf(optional.optional).toEqualTypeOf<true>();
    defineCommand({
      name: 'example.described', effect: 'read', description: 'Types.',
      input: { kind, count: optional, choice },
      output: {},
      execute(input) {
        expectTypeOf(input.kind).toEqualTypeOf<'zone'>();
        expectTypeOf(input.choice).toEqualTypeOf<'a' | 'b'>();
        expectTypeOf(input.count).toEqualTypeOf<number | undefined>();
        return {};
      },
    });
  });
});

describe('unions and records', () => {
  const shape = field.union('kind', {
    line: { price: field.number() },
    zone: { from: field.number(), to: field.number(), label: field.optional(field.string(8)) },
  });
  it('advertise oneOf with a const discriminator and dispatch on it', () => {
    expect(shape.jsonSchema.oneOf.map(variant => (variant.properties as Record<string, unknown>).kind)).toEqual([{ const: 'line' }, { const: 'zone' }]);
    expect(shape.parse({ kind: 'line', price: 2 })).toEqual({ kind: 'line', price: 2 });
    expect(shape.parse({ kind: 'zone', from: 1, to: 2 })).toEqual({ kind: 'zone', from: 1, to: 2 });
    expect(() => shape.parse({ kind: 'line', from: 1, to: 2 })).toThrow(expect.objectContaining({ details: { reason: 'unknown field' } }));
    expect(() => shape.parse({ kind: 'circle' })).toThrow(expect.objectContaining({ code: 'invalid_input', details: { path: 'kind', reason: 'unknown variant' } }));
    expect(() => shape.parse({ kind: 'toString' })).toThrow(expect.objectContaining({ details: { path: 'kind', reason: 'unknown variant' } }));
    expect(() => shape.parse({ price: 1 })).toThrow(expect.objectContaining({ details: { path: 'kind', reason: 'missing field' } }));
    expect(() => shape.parse([])).toThrow(expect.objectContaining({ details: { reason: 'expected object' } }));
    expect(() => shape.parse({ kind: 'zone', from: 1, to: 'x' })).toThrow(expect.objectContaining({ details: { path: 'to', reason: 'expected number' } }));
  });
  it('infer a discriminated union type', () => {
    type Shape = ReturnType<typeof shape.parse>;
    expectTypeOf<Shape>().toEqualTypeOf<{ kind: 'line'; price: number } | { kind: 'zone'; from: number; to: number; label?: string }>();
    const value = shape.parse({ kind: 'line', price: 1 });
    if (value.kind === 'line') expectTypeOf(value.price).toEqualTypeOf<number>();
  });
  it('reject unbounded or self-declared variants at authoring time', () => {
    expect(() => field.union('kind', {})).toThrow('1 to 32 variants');
    expect(() => field.union('kind', { line: { kind: field.literal('line') } })).toThrow('must not declare the discriminator');
    expect(() => field.union('', { line: {} })).toThrow('discriminator');
  });
  it('bound records by key count and key length without echoing keys', () => {
    const levels = field.record(field.object({ price: field.number() }), { maxKeys: 2, maxKeyLength: 4 });
    expectTypeOf(levels.parse).returns.toEqualTypeOf<Record<string, { price: number }>>();
    expect(levels.jsonSchema).toEqual({
      type: 'object', maxProperties: 2, propertyNames: { minLength: 1, maxLength: 4 },
      additionalProperties: { type: 'object', properties: { price: { type: 'number' } }, required: ['price'], additionalProperties: false },
    });
    expect(levels.parse({ tp: { price: 1 }, sl: { price: 2 } })).toEqual({ tp: { price: 1 }, sl: { price: 2 } });
    const parsed = field.record(field.number(), { maxKeys: 1 }).parse(JSON.parse('{"__proto__":1}'));
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.keys(parsed)).toEqual(['__proto__']);
    expect(() => levels.parse({ a: { price: 1 }, b: { price: 1 }, c: { price: 1 } })).toThrow(expect.objectContaining({ code: 'limit_exceeded', details: { reason: 'too many keys' } }));
    expect(() => levels.parse({ toolong: { price: 1 } })).toThrow(expect.objectContaining({ details: { reason: 'invalid key' } }));
    expect(() => levels.parse({ '': { price: 1 } })).toThrow(expect.objectContaining({ details: { reason: 'invalid key' } }));
    expect(() => objectSchema({ levels }).parse({ levels: { tp: { price: 'x' } } })).toThrow(expect.objectContaining({ details: { path: 'levels', reason: 'expected number' } }));
    expect(() => field.record(field.number(), { maxKeys: 0 })).toThrow('maxKeys');
    expect(() => field.record(field.number(), { maxKeys: Infinity })).toThrow('maxKeys');
    expect(() => field.record(field.number(), { maxKeys: 2, maxKeyLength: 0 })).toThrow('Record keys');
    expect(() => field.record(field.optional(field.number()), { maxKeys: 2 })).toThrow('optional');
  });
});

describe('error details', () => {
  const schema = objectSchema({
    operations: field.array(field.object({ points: field.array(field.object({ time: field.integer({ minimum: 0, maximum: 10 }) }), { maxItems: 2 }) }), { maxItems: 3 }),
    mode: field.optional(field.oneOf(['a', 'b'])),
  });
  const details = (value: unknown) => {
    try {
      schema.parse(value);
      return null;
    } catch (error) {
      return { code: (error as ChartCommandError).code, ...(error as ChartCommandError).details };
    }
  };
  const ops = (time: unknown) => ({ operations: [{ points: [] }, { points: [] }, { points: [{ time }] }] });
  it('name nested paths and fixed reasons without input values', () => {
    expect(details(ops(1.5))).toEqual({ code: 'invalid_input', path: 'operations[2].points[0].time', reason: 'expected integer' });
    expect(details(ops(-1))).toEqual({ code: 'invalid_input', path: 'operations[2].points[0].time', reason: 'below minimum' });
    expect(details(ops(11))).toEqual({ code: 'limit_exceeded', path: 'operations[2].points[0].time', reason: 'above maximum' });
    expect(details({ operations: [{ points: [{}] }] })).toEqual({ code: 'invalid_input', path: 'operations[0].points[0].time', reason: 'missing field' });
    expect(details({ operations: [{ points: [], extraKey: 1 }] })).toEqual({ code: 'invalid_input', path: 'operations[0]', reason: 'unknown field' });
    expect(details({ operations: [{}, {}, {}, {}] })).toEqual({ code: 'limit_exceeded', path: 'operations', reason: 'too many items' });
    expect(details({ operations: 'x' })).toEqual({ code: 'invalid_input', path: 'operations', reason: 'expected array' });
    expect(details({ operations: [], mode: 'other' })).toEqual({ code: 'invalid_input', path: 'mode', reason: 'not an allowed value' });
    expect(details(null)).toEqual({ code: 'invalid_input', reason: 'expected object' });
    expect(details({ operations: [] })).toBeNull();
  });
});

describe('command list typing', () => {
  it('lets an erased command list compose typed native children', () => {
    const commands: AutomationCommand[] = [
      {
        name: 'example.forward', version: 1, effect: 'mutation', description: 'Forward to drawings.',
        input: { jsonSchema: { type: 'object' }, parse: value => value },
        output: { jsonSchema: { type: 'object' }, parse: value => value },
        async execute(input, context) {
          expectTypeOf(input).toEqualTypeOf<unknown>();
          const receipt = await context.execute('drawings.apply', input);
          expectTypeOf(receipt.ids).toEqualTypeOf<string[]>();
          const read = await context.execute('data.read', input);
          expectTypeOf(read.rows).items.toMatchTypeOf<object>();
          // A prepared (non-literal) input still resolves the typed overload.
          const prepared = { operations: [1, 2].map(price => ({ action: 'create' as const, type: 'horizontal_line' as const, points: [{ price }] })) };
          expectTypeOf(await context.execute('drawings.apply', prepared)).toEqualTypeOf<typeof receipt>();
          // @ts-expect-error a known command with the wrong input type no longer falls back to `unknown`.
          await context.execute('drawings.apply', { operations: [{ action: 'paint' }] });
          expectTypeOf(await context.execute('example.double', { value: 1 })).toEqualTypeOf<unknown>();
          return receipt;
        },
      },
      double,
    ];
    expect(commands).toHaveLength(2);
  });
});

describe('command metadata', () => {
  it('derives snake_case tool names and default concurrency', () => {
    expect(defaultToolName('navigation.searchSymbols')).toBe('navigation_search_symbols');
    expect(defaultToolName('my-app.range')).toBe('my_app_range');
    const sdk = createChartAutomation(host);
    sdk.extensions.register(double);
    sdk.extensions.register({ ...double, name: 'example.write', effect: 'mutation', toolName: 'write_example', instructions: 'Only when asked.' });
    expect(sdk.capabilities().commands.map(({ name, toolName, concurrency, instructions }) => ({ name, toolName, concurrency, instructions }))).toEqual([
      { name: 'example.double', toolName: 'example_double', concurrency: 'shared', instructions: undefined },
      { name: 'example.write', toolName: 'write_example', concurrency: 'exclusive', instructions: 'Only when asked.' },
    ]);
    sdk.destroy();
  });
  it('rejects invalid, reserved and duplicate tool names', () => {
    const sdk = createChartAutomation(host);
    sdk.extensions.register(double);
    expect(() => sdk.extensions.register({ ...double, name: 'example.other', toolName: 'Bad Name' })).toThrow('invalid_input');
    expect(() => sdk.extensions.register({ ...double, name: 'example.other', toolName: 'data_read' })).toThrow('invalid_input');
    expect(() => sdk.extensions.register({ ...double, name: 'example.other', toolName: 'example_double' })).toThrow(expect.objectContaining({ code: 'operation_conflict' }));
    expect(() => sdk.extensions.register({ ...double, name: 'example.other', toolName: 'x'.repeat(65) })).toThrow('invalid_input');
    sdk.destroy();
  });
  it('validates examples, instructions and concurrency at registration', () => {
    const sdk = createChartAutomation(host);
    expect(() => sdk.extensions.register({ ...double, examples: [{ input: { value: 'one' } }] })).toThrow('Invalid example');
    expect(() => sdk.extensions.register({ ...double, instructions: 'x'.repeat(4001) })).toThrow('invalid_input');
    expect(() => sdk.extensions.register({ ...double, concurrency: 'parallel' as never })).toThrow('invalid_input');
    sdk.extensions.register({ ...double, examples: [{ description: 'Double five', input: { value: 5 } }] });
    expect(sdk.capabilities().commands[0]?.examples).toEqual([{ description: 'Double five', input: { value: 5 } }]);
    sdk.destroy();
  });
  it('advances the capabilities revision on register and unregister', () => {
    const sdk = createChartAutomation(host);
    const start = sdk.capabilities().revision;
    const unregister = sdk.extensions.register(double);
    expect(sdk.capabilities().revision).toBe(start + 1);
    unregister();
    unregister();
    expect(sdk.capabilities().revision).toBe(start + 2);
    sdk.destroy();
  });
});

describe('child execution', () => {
  const parent = (execute: AutomationCommand<{ value: number }, { value: number }>['execute'], effect: AutomationCommand['effect'] = 'read') => defineCommand({
    name: 'example.parent', effect, description: 'Composes another command.',
    input: { value: field.number() },
    output: { value: field.number() },
    execute,
  });

  it('runs a registered command with a derived ID and validated output', async () => {
    target = { id: 'chart', generation: 0 };
    const sdk = createChartAutomation(host, { maxConcurrent: 1 });
    const seen: string[] = [];
    sdk.extensions.register({ ...double, execute: ({ value }, context) => { seen.push(context.requestId); return { value: value * 2 }; } });
    sdk.extensions.register(parent(async ({ value }, context) => {
      const first = await context.execute('example.double', { value }) as { value: number };
      const second = await context.execute('example.double', first) as { value: number };
      return second;
    }));
    expect(await sdk.execute('example.parent', { value: 3 }, { requestId: 'top', target })).toEqual({ value: 12 });
    expect(seen).toEqual(['top/1', 'top/2']);
    await expect(sdk.execute('example.parent', { value: 900 }, { requestId: 'top', target })).rejects.toThrow('limit_exceeded');
    sdk.destroy();
  });
  it('bounds effects, target changes and nesting depth', async () => {
    const sdk = createChartAutomation(host);
    sdk.extensions.register({ ...double, name: 'example.write', effect: 'mutation' });
    sdk.extensions.register(parent((input, context) => context.execute('example.write', input) as Promise<{ value: number }>));
    await expect(sdk.execute('example.parent', { value: 1 })).rejects.toThrow('cannot run a mutation command');
    const recursive = createChartAutomation(host);
    recursive.extensions.register(parent((input, context) => context.execute('example.parent', input) as Promise<{ value: number }>));
    await expect(recursive.execute('example.parent', { value: 1 })).rejects.toThrow('nesting is too deep');
    sdk.destroy(); recursive.destroy();
  });
  it('enforces policy and rejects a stale target for children', async () => {
    const readOnly = createChartAutomation(host, { commands: ['example.parent'] });
    readOnly.extensions.register(double);
    readOnly.extensions.register(parent((input, context) => context.execute('example.double', input) as Promise<{ value: number }>));
    await expect(readOnly.execute('example.parent', { value: 1 })).rejects.toThrow('unsupported');
    readOnly.destroy();

    target = { id: 'chart', generation: 0 };
    const sdk = createChartAutomation(host);
    sdk.extensions.register({ ...double, execute: ({ value }) => { target = { id: 'chart', generation: 1 }; return { value }; } });
    sdk.extensions.register(parent((input, context) => context.execute('example.double', input) as Promise<{ value: number }>));
    await expect(sdk.execute('example.parent', { value: 1 })).rejects.toThrow('stale_binding');
    sdk.destroy();
    target = { id: 'chart', generation: 0 };
  });
  it('stops children once the parent is cancelled', async () => {
    const sdk = createChartAutomation(host);
    const controller = new AbortController();
    sdk.extensions.register(double);
    sdk.extensions.register(parent(async (input, context) => {
      controller.abort();
      return context.execute('example.double', input) as Promise<{ value: number }>;
    }));
    await expect(sdk.execute('example.parent', { value: 1 }, sdk.request({ signal: controller.signal }))).rejects.toThrow('cancelled');
    sdk.destroy();
  });
});
