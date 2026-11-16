import { ChartCommandError } from '../core-contracts/index.js';
import type { AutomationCommand, AutomationSchema } from './contracts.js';

/** Internal bridge: deliberately absent from the public SDK exports. */
type NativeRegister = <I, O>(command: AutomationCommand<I, O>) => () => void;
const registrars = new WeakMap<object, NativeRegister>();
/** The current JSON Schema of native inputs whose accepted values follow chart state. */
const liveSchemas = new WeakMap<object, () => Readonly<Record<string, unknown>>>();

export function connectNativeRegistrar(session: object, register: NativeRegister): void {
  registrars.set(session, register);
}
export function registerNativeCommand<I, O>(session: object, command: AutomationCommand<I, O>): () => void {
  const register = registrars.get(session);
  if (!register) throw new ChartCommandError('unsupported');
  return register(command);
}

/**
 * Marks a native input whose advertised JSON Schema follows chart state (the
 * chart's custom studies). The registry re-reads `current` when capabilities
 * are read and advances the capability revision when it changed.
 */
export function liveNativeSchema<T>(schema: AutomationSchema<T>, current: () => Readonly<Record<string, unknown>>): AutomationSchema<T> {
  liveSchemas.set(schema, current);
  return schema;
}
/** The live JSON Schema reader of a native input, if it has one. */
export function nativeLiveSchema(schema: object): (() => Readonly<Record<string, unknown>>) | undefined {
  return liveSchemas.get(schema);
}
