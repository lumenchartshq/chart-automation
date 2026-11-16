import { ChartCommandError, type ChartErrorCode } from '../core-contracts/index.js';
import type { AutomationSchema } from './contracts.js';

/**
 * Small schema builders whose advertised JSON Schema and runtime parser come
 * from one declaration, so the two cannot drift. Native commands declare their
 * shapes with these too; their domain validators then add the rules a schema
 * cannot express (cross-field checks, catalog versions, byte budgets).
 *
 * Parse failures carry `details`: the field path (`operations[2].points[0].time`)
 * and a short fixed reason (`expected integer`). Paths name declared fields
 * and array indexes only; record keys and unknown keys are input, so they are
 * never echoed.
 */
export interface Field<T, J> {
  readonly jsonSchema: J;
  /** `true` only for fields wrapped with `field.optional`. */
  readonly optional: boolean;
  parse(value: unknown): T;
  /** The same field with `description` in its advertised JSON Schema; 1 to 1,000 characters. */
  describe(text: string): this & { readonly jsonSchema: J & { description: string } };
}
export type AnyField = Field<unknown, unknown>;
/** Field map accepted by `objectSchema`, `field.object` and `defineCommand`. */
export type Fields = Record<string, AnyField>;
type OptionalKeys<S extends Fields> = { [K in keyof S]: S[K]['optional'] extends true ? K : never }[keyof S];
type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Parsed values; optional fields become optional properties. */
export type FieldValues<S extends Fields> = Simplify<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: ReturnType<S[K]['parse']> } &
  { [K in OptionalKeys<S>]?: Exclude<ReturnType<S[K]['parse']>, undefined> }>;
export interface ObjectJsonSchema<S extends Record<string, AnyField>> {
  type: 'object';
  properties: { [K in keyof S]: S[K]['jsonSchema'] };
  required: string[];
  additionalProperties: false;
  minProperties?: number;
}
/** Variants of `field.union`, keyed by discriminator value. */
export type UnionVariants = Record<string, Fields>;
/** Parsed union value: the discriminator literal plus that variant's fields. */
export type UnionValues<D extends string, V extends UnionVariants> =
  { [K in keyof V & string]: Simplify<{ [P in D]: K } & FieldValues<V[K]>> }[keyof V & string];
export interface UnionJsonSchema {
  oneOf: Readonly<Record<string, unknown>>[];
}
export interface RecordJsonSchema<J> {
  type: 'object';
  additionalProperties: J;
  maxProperties: number;
  propertyNames: { minLength: 1; maxLength: number };
}

const MAX_DESCRIPTION = 1000;
const MAX_VARIANTS = 32;
const DEFAULT_KEY_LENGTH = 64;
const MAX_KEY_LENGTH = 1024;

/** A rejected input with a fixed reason and no location yet; containers add the path. */
const reject = (reason: string, code: ChartErrorCode = 'invalid_input') => new ChartCommandError(code, code, { reason });
const authoring = (message: string) => new ChartCommandError('invalid_input', message);

/** Prefixes a field name or array index to the path of a rejection raised below it. */
function atPath(error: unknown, segment: string | number): unknown {
  if (!(error instanceof ChartCommandError)) return error;
  const head = typeof segment === 'number' ? `[${segment}]` : segment;
  const tail = error.details?.path;
  let path = head;
  if (tail !== undefined) path = tail.startsWith('[') ? `${head}${tail}` : `${head}.${tail}`;
  return new ChartCommandError(error.code, error.message, { ...error.details, path });
}
function within<T>(segment: string | number, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw atPath(error, segment);
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export interface StringOptions {
  /** Anchored, flag-free pattern; its source is evaluated in Unicode mode. */
  readonly pattern?: RegExp;
}
export interface ObjectOptions {
  /** At least this many declared fields must be present. */
  readonly minProperties?: number;
}
/** Compile the advertised source in the same Unicode mode as JSON Schema validators. */
function patternOf(pattern: RegExp | undefined): RegExp | undefined {
  if (pattern === undefined) return undefined;
  if (!(pattern instanceof RegExp) || pattern.flags || !pattern.source.startsWith('^') || !pattern.source.endsWith('$'))
    throw authoring('String patterns must be anchored with ^ and $ and use no flags');
  try {
    return new RegExp(pattern.source, 'u');
  } catch {
    throw authoring('String patterns must be Unicode-compatible');
  }
}

/** JSON Schema compares objects by their properties, regardless of key order. */
function jsonValueKey(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!isPlainObject(entry)) return entry;
    return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
  });
}

function make<T, J>(jsonSchema: J, parse: (value: unknown) => T, optional = false): Field<T, J> {
  return {
    jsonSchema,
    optional,
    parse,
    describe(text) {
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_DESCRIPTION) throw authoring('Field descriptions need 1 to 1,000 characters');
      return make({ ...jsonSchema, description: text }, parse, optional) as never;
    },
  };
}

/** A plain non-array object with no keys outside `allowed`. */
export function strictRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value)) throw reject('expected object');
  if (Object.keys(value).some(key => !allowed.includes(key))) throw reject('unknown field');
  return value;
}

export const field = {
  /** Non-blank string up to `maxLength` characters, optionally matching `pattern`. */
  string(maxLength = 256, options: StringOptions = {}): Field<string, { type: 'string'; minLength: 1; maxLength: number; pattern?: string }> {
    const pattern = patternOf(options.pattern);
    return make({ type: 'string', minLength: 1, maxLength, ...(pattern ? { pattern: pattern.source } : {}) }, value => {
      if (typeof value !== 'string') throw reject('expected string');
      if (!value.trim()) throw reject('blank string');
      if (value.length > maxLength && [...value].length > maxLength) throw reject('too long');
      if (pattern && !pattern.test(value)) throw reject('wrong format');
      return value;
    });
  },
  /**
   * String up to `maxLength` characters, including empty or whitespace-only text unless `minLength` says
   * otherwise, optionally matching `pattern`.
   */
  text(maxLength = 256, options: StringOptions & { minLength?: number } = {}): Field<string, { type: 'string'; maxLength: number; minLength?: number; pattern?: string }> {
    const pattern = patternOf(options.pattern);
    const { minLength } = options;
    if (minLength !== undefined && (!Number.isSafeInteger(minLength) || minLength < 0 || minLength > maxLength)) throw authoring('Text minLength must be between 0 and maxLength');
    return make({ type: 'string', maxLength, ...(minLength ? { minLength } : {}), ...(pattern ? { pattern: pattern.source } : {}) }, value => {
      if (typeof value !== 'string') throw reject('expected string');
      const length = [...value].length;
      if (minLength && length < minLength) throw reject('too short');
      if (length > maxLength) throw reject('too long');
      if (pattern && !pattern.test(value)) throw reject('wrong format');
      return value;
    });
  },
  /** Safe integer; below `minimum` is invalid, above `maximum` exceeds a limit. */
  integer<J extends { minimum?: number; maximum?: number }>(bounds: J = {} as J): Field<number, { type: 'integer' } & J> {
    return make({ type: 'integer', ...bounds }, value => {
      if (!Number.isSafeInteger(value)) throw reject('expected integer');
      return inBounds(value as number, bounds);
    });
  },
  oneOf<const T extends string>(values: readonly T[]): Field<T, { enum: readonly T[] }> {
    return make({ enum: values }, value => {
      if (!values.includes(value as T)) throw reject('not an allowed value');
      return value as T;
    });
  },
  /** Finite number; below `minimum` is invalid, above `maximum` exceeds a limit. */
  number<J extends { minimum?: number; maximum?: number }>(bounds: J = {} as J): Field<number, { type: 'number' } & J> {
    return make({ type: 'number', ...bounds }, value => {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw reject('expected number');
      return inBounds(value, bounds);
    });
  },
  boolean(): Field<boolean, { type: 'boolean' }> {
    return make({ type: 'boolean' }, value => {
      if (typeof value !== 'boolean') throw reject('expected boolean');
      return value;
    });
  },
  /** Exactly `value`. */
  literal<const T extends string | number | boolean>(value: T): Field<T, { const: T }> {
    return make({ const: value }, input => {
      if (input !== value) throw reject('unexpected value');
      return value;
    });
  },
  /**
   * Bounded array: `maxItems` is required so model input can never be unbounded. `uniqueItems` rejects
   * repeated JSON values, ignoring object property order.
   */
  array<T, J>(item: Field<T, J>, bounds: { maxItems: number; minItems?: number; uniqueItems?: boolean }): Field<T[], { type: 'array'; items: J; maxItems: number; minItems?: number; uniqueItems?: true }> {
    const { maxItems, minItems, uniqueItems } = bounds;
    if (!Number.isSafeInteger(maxItems) || maxItems < 1 || (minItems !== undefined && (!Number.isSafeInteger(minItems) || minItems < 0 || minItems > maxItems)))
      throw authoring('Array fields need a bounded maxItems');
    return make({ type: 'array', items: item.jsonSchema, maxItems, ...(minItems !== undefined ? { minItems } : {}), ...(uniqueItems ? { uniqueItems: true as const } : {}) }, value => {
      if (!Array.isArray(value)) throw reject('expected array');
      if (value.length > maxItems) throw reject('too many items', 'limit_exceeded');
      if (minItems !== undefined && value.length < minItems) throw reject('too few items');
      const parsed = value.map((entry, index) => within(index, () => item.parse(entry)));
      if (uniqueItems && new Set(value.map(jsonValueKey)).size !== value.length) throw reject('repeated item');
      return parsed;
    });
  },
  /** Nested closed object; `minProperties` requires that many of its fields to be present. */
  object<S extends Record<string, AnyField>>(fields: S, options: ObjectOptions = {}): Field<FieldValues<S>, ObjectJsonSchema<S>> {
    const schema = objectSchema(fields, options);
    return make(schema.jsonSchema, value => schema.parse(value));
  },
  /**
   * Any JSON value, advertised without constraints. Use only where the owner validates the value itself,
   * such as per-drawing settings whose fields depend on the drawing type.
   */
  unknown(): Field<unknown, Record<string, never>> {
    return make({}, value => value);
  },
  /** A string, finite number or boolean. */
  scalar(): Field<string | number | boolean, { type: ['string', 'number', 'boolean'] }> {
    return make({ type: ['string', 'number', 'boolean'] }, value => {
      if (typeof value === 'string' || typeof value === 'boolean') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      throw reject('expected string, number or boolean');
    });
  },
  /**
   * Closed objects told apart by a string `discriminator`, advertised as
   * `oneOf` with a `const` discriminator per variant. Variants are keyed by
   * discriminator value and must not declare the discriminator themselves.
   *
   * `minProperties` per variant counts the discriminator, e.g. 3 for "the action, an id and at least one change".
   *
   * @example field.union('kind', { line: { price: field.number() }, zone: { from: field.number(), to: field.number() } })
   */
  union<const D extends string, const V extends UnionVariants>(
    discriminator: D,
    variants: V,
    options: { readonly minProperties?: { readonly [K in keyof V]?: number } } = {},
  ): Field<UnionValues<D, V>, UnionJsonSchema> {
    const tags = Object.keys(variants);
    if (typeof discriminator !== 'string' || !discriminator) throw authoring('Union fields need a discriminator');
    if (!tags.length || tags.length > MAX_VARIANTS) throw authoring('Union fields need 1 to 32 variants');
    if (tags.some(tag => !tag || Object.hasOwn(variants[tag]!, discriminator))) throw authoring('Union variants must not declare the discriminator');
    const schemas = new Map(tags.map(tag => {
      const minProperties = options.minProperties?.[tag];
      return [tag, objectSchema({ [discriminator]: field.literal(tag), ...variants[tag]! }, minProperties === undefined ? {} : { minProperties })];
    }));
    return make({ oneOf: [...schemas.values()].map(schema => schema.jsonSchema) }, value => {
      if (!isPlainObject(value)) throw reject('expected object');
      const tag = Object.hasOwn(value, discriminator) ? value[discriminator] : undefined;
      if (tag === undefined) throw atPath(reject('missing field'), discriminator);
      const schema = typeof tag === 'string' ? schemas.get(tag) : undefined;
      if (!schema) throw atPath(reject('unknown variant'), discriminator);
      return schema.parse(value) as UnionValues<D, V>;
    });
  },
  /**
   * Object with caller-chosen keys and one value shape. `maxKeys` is required
   * so model input stays bounded; keys are 1 to `maxKeyLength` (default 64)
   * characters. Value errors point at the record, never at a key.
   */
  record<T, J>(value: Field<T, J>, bounds: { maxKeys: number; maxKeyLength?: number }): Field<Record<string, T>, RecordJsonSchema<J>> {
    const { maxKeys, maxKeyLength = DEFAULT_KEY_LENGTH } = bounds;
    if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) throw authoring('Record fields need a bounded maxKeys');
    if (!Number.isSafeInteger(maxKeyLength) || maxKeyLength < 1 || maxKeyLength > MAX_KEY_LENGTH) throw authoring('Record keys need 1 to 1,024 characters');
    if (value.optional) throw authoring('Record values cannot be optional');
    return make({ type: 'object', additionalProperties: value.jsonSchema, maxProperties: maxKeys, propertyNames: { minLength: 1, maxLength: maxKeyLength } }, input => {
      if (!isPlainObject(input)) throw reject('expected object');
      const entries = Object.entries(input);
      if (entries.length > maxKeys) throw reject('too many keys', 'limit_exceeded');
      if (entries.some(([key]) => !key || key.length > maxKeyLength)) throw reject('invalid key');
      return Object.fromEntries(entries.map(([key, entry]) => {
        try {
          return [key, value.parse(entry)];
        } catch (error) {
          if (!(error instanceof ChartCommandError)) throw error;
          throw new ChartCommandError(error.code, error.message, error.details?.reason ? { reason: error.details.reason } : undefined);
        }
      }));
    });
  },
  /** Accepts `null` in addition to the inner value. */
  nullable<T, J>(inner: Field<T, J>): Field<T | null, { anyOf: [J, { type: 'null' }] }> {
    return make({ anyOf: [inner.jsonSchema, { type: 'null' }] as [J, { type: 'null' }] }, value => (value === null ? null : inner.parse(value)), inner.optional);
  },
  optional<T, J>(inner: Field<T, J>): Field<T | undefined, J> & { readonly optional: true } {
    return make(inner.jsonSchema, value => (value === undefined ? undefined : inner.parse(value)), true) as Field<T | undefined, J> & { readonly optional: true };
  },
};

function inBounds(value: number, bounds: { minimum?: number; maximum?: number }): number {
  if (bounds.minimum !== undefined && value < bounds.minimum) throw reject('below minimum');
  if (bounds.maximum !== undefined && value > bounds.maximum) throw reject('above maximum', 'limit_exceeded');
  return value;
}

/** Closed object schema. Absent optional fields stay absent in the parsed value. */
export function objectSchema<S extends Record<string, AnyField>>(fields: S, options: ObjectOptions = {}): AutomationSchema<FieldValues<S>> & { jsonSchema: ObjectJsonSchema<S> } {
  const names = Object.keys(fields);
  const properties = Object.fromEntries(names.map(name => [name, fields[name]!.jsonSchema])) as ObjectJsonSchema<S>['properties'];
  const { minProperties } = options;
  if (minProperties !== undefined && (!Number.isSafeInteger(minProperties) || minProperties < 1 || minProperties > names.length))
    throw authoring('Object minProperties must be between 1 and the number of fields');
  return {
    jsonSchema: { type: 'object', properties, required: names.filter(name => !fields[name]!.optional), additionalProperties: false, ...(minProperties ? { minProperties } : {}) },
    parse(value) {
      const input = strictRecord(value, names);
      if (minProperties && Object.keys(input).filter(name => input[name] !== undefined).length < minProperties) throw reject('too few fields');
      const parsed: Record<string, unknown> = {};
      for (const name of names) {
        const entry = fields[name]!;
        const raw = Object.hasOwn(input, name) ? input[name] : undefined;
        if (raw === undefined && !entry.optional) throw atPath(reject('missing field'), name);
        const result = within(name, () => entry.parse(raw));
        if (result !== undefined) parsed[name] = result;
      }
      return parsed as FieldValues<S>;
    },
  };
}

/** An object with no fields. */
export const emptySchema: AutomationSchema<Record<string, never>> = objectSchema({}) as AutomationSchema<Record<string, never>>;

/**
 * Output schema for trusted native owners whose results are already typed by
 * their port. Guards only the object boundary; the type comes from the port.
 */
export function nativeObject<T extends object>(): AutomationSchema<T> {
  return {
    jsonSchema: { type: 'object' },
    parse(value) {
      if (!isPlainObject(value)) throw reject('expected object');
      return value as T;
    },
  };
}
