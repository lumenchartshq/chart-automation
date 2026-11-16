import type { AutomationCommand } from './contracts.js';
import { objectSchema, type FieldValues, type Fields } from './schema.js';

/** A command declared with field maps; `version` defaults to 1. */
export interface CommandDefinition<I extends Fields, O extends Fields>
  extends Omit<AutomationCommand<FieldValues<I>, FieldValues<O>>, 'input' | 'output' | 'version'> {
  version?: number;
  input: I;
  output: O;
}

/**
 * Declares a command whose advertised JSON Schemas and runtime parsers come
 * from the same `field` declarations, with handler types inferred from them.
 */
export function defineCommand<I extends Fields, O extends Fields>(
  definition: CommandDefinition<I, O>,
): AutomationCommand<FieldValues<I>, FieldValues<O>> {
  const { input, output, version = 1, ...command } = definition;
  return { ...command, version, input: objectSchema(input), output: objectSchema(output) };
}
