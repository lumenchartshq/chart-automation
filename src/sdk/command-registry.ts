import { ChartCommandError } from '../core-contracts/index.js';
import {
  AUTOMATION_CONCURRENCY, AUTOMATION_EFFECTS, type AutomationCommand, type AutomationCommandContext,
  type AutomationCommandDescriptor, type AutomationContext, type AutomationEffect, type AutomationLimits,
  type AutomationRegistration, type AutomationRequest,
} from './contracts.js';
import { assertMessage, type ExecutionOwner } from './execution.js';
import { NATIVE_COMMAND_NAMES, isReservedCommandName } from './builtin-contracts.js';
import { nativeLiveSchema } from './native-registration.js';
import { disposeAll } from './dispose.js';
import { RESERVED_TOOL_NAMES, TOOL_NAME, commandConcurrency, commandToolName } from './tool-names.js';

const COMMAND_NAME = /^[a-z][a-z0-9-]*\.[a-z][a-zA-Z0-9.]*$/;
const MAX_INSTRUCTIONS = 4000;
const MAX_EXAMPLES = 8;
/** Nested `context.execute` calls allowed below one top-level request. */
const MAX_CHILD_DEPTH = 4;

function assertValidDefinition(command: AutomationCommand, native: boolean): void {
  const invalid = () => new ChartCommandError('invalid_input');
  if (!COMMAND_NAME.test(command.name)) throw invalid();
  if (!Number.isSafeInteger(command.version) || command.version < 1) throw invalid();
  if (!AUTOMATION_EFFECTS.includes(command.effect)) throw invalid();
  if (native && !NATIVE_COMMAND_NAMES.has(command.name)) throw invalid();
  if (!native && isReservedCommandName(command.name)) throw invalid();
  if (command.concurrency !== undefined && !AUTOMATION_CONCURRENCY.includes(command.concurrency)) throw invalid();
  if (command.toolName !== undefined && (typeof command.toolName !== 'string' || !TOOL_NAME.test(command.toolName))) throw invalid();
  if (!TOOL_NAME.test(commandToolName(command)) || RESERVED_TOOL_NAMES.has(commandToolName(command))) throw invalid();
  if (command.instructions !== undefined && (typeof command.instructions !== 'string' || !command.instructions.trim() || command.instructions.length > MAX_INSTRUCTIONS)) throw invalid();
  assertValidExamples(command);
  if (command.targetChange === undefined) return;
  if (command.targetChange !== 'synchronous' || command.effect !== 'mutation') throw invalid();
}

/** Examples are advertised to models, so each must pass the command's own input parser. */
function assertValidExamples(command: AutomationCommand): void {
  if (command.examples === undefined) return;
  if (!Array.isArray(command.examples) || command.examples.length > MAX_EXAMPLES) throw new ChartCommandError('invalid_input');
  for (const example of command.examples) {
    if (!example || typeof example !== 'object') throw new ChartCommandError('invalid_input');
    if (example.description !== undefined && typeof example.description !== 'string') throw new ChartCommandError('invalid_input');
    try { command.input.parse(structuredClone(example.input)); } catch { throw new ChartCommandError('invalid_input', `Invalid example for ${command.name}`); }
  }
}

/** Copies the definition so later caller mutation cannot change the registered contract. */
function ownedCopy(command: AutomationCommand): AutomationCommand {
  return {
    ...command,
    input: { ...command.input, jsonSchema: structuredClone(command.input.jsonSchema) },
    output: { ...command.output, jsonSchema: structuredClone(command.output.jsonSchema) },
    ...(command.examples ? { examples: structuredClone(command.examples) } : {}),
  };
}

function describe(command: AutomationCommand): AutomationCommandDescriptor {
  return {
    name: command.name,
    version: command.version,
    description: command.description,
    effect: command.effect,
    concurrency: commandConcurrency(command),
    toolName: commandToolName(command),
    input: structuredClone(command.input.jsonSchema),
    output: structuredClone(command.output.jsonSchema),
    ...(command.instructions ? { instructions: command.instructions } : {}),
    ...(command.examples ? { examples: structuredClone([...command.examples]) } : {}),
  };
}

/** A child may read, or share its parent's effect, so a declared effect always bounds what a call does. */
const childEffectAllowed = (parent: AutomationEffect, child: AutomationEffect) => child === 'read' || child === parent;

export function createCommandRegistry(options: {
  execution: ExecutionOwner;
  limits: AutomationLimits;
  assertLive(): void;
  allowed(name: string, effect: AutomationEffect): boolean;
  requireCapability(name: string, effect: AutomationEffect): void;
  /** Fills an omitted request with a fresh ID and the current target. */
  resolveRequest(request?: AutomationRequest): AutomationRequest;
  /** SDK ports callable as children; each runs without admission under the parent's context. */
  ports?: Readonly<Record<string, { effect: AutomationEffect; run(input: unknown, context: AutomationContext): Promise<unknown> }>>;
}) {
  const { execution, limits, assertLive, allowed, requireCapability, resolveRequest, ports = {} } = options;
  const commands = new Map<string, AutomationCommand>();
  const toolNames = new Map<string, string>();
  /** Native commands whose advertised input schema follows chart state, with the serialized schema last advertised. */
  const liveInputs = new Map<AutomationCommand, { current: () => Readonly<Record<string, unknown>>; advertised: string }>();
  let revision = 0;

  /**
   * Re-reads live input schemas; a changed schema replaces the advertised one
   * and advances the revision, the signal for hosts to rebuild tool lists.
   * A reader that fails keeps the last advertisement.
   */
  const refreshLiveInputs = () => {
    for (const [command, live] of liveInputs) {
      let schema: Readonly<Record<string, unknown>>;
      try { schema = live.current(); } catch { continue; }
      const serialized = JSON.stringify(schema);
      if (serialized === live.advertised) continue;
      live.advertised = serialized;
      command.input = { ...command.input, jsonSchema: structuredClone(schema) };
      revision++;
    }
  };

  const lookup = (name: string) => {
    assertLive();
    const command = commands.get(name);
    if (!command) throw new ChartCommandError('unsupported');
    requireCapability(name, command.effect);
    return command;
  };
  const parseInput = (command: AutomationCommand, input: unknown) => {
    assertMessage(input, limits.messageBytes);
    return command.input.parse(structuredClone(input));
  };
  /**
   * A result the output schema rejects is a handler bug, not a bad call: it
   * surfaces as `unavailable` with a fixed reason and no field path, so a model
   * never "corrects" input that was valid.
   */
  const validateOutput = (command: AutomationCommand, value: unknown) => {
    let result: unknown;
    try {
      result = command.output.parse(value);
    } catch {
      throw new ChartCommandError('unavailable', `${command.name} returned an invalid result`, { reason: 'invalid result' });
    }
    assertMessage(result, limits.messageBytes);
    return structuredClone(result);
  };

  /** Adds child execution to a handler context; children inherit the signal, deadline and target fence. */
  const commandContext = (command: AutomationCommand, context: AutomationContext, depth: number): AutomationCommandContext => {
    let children = 0;
    const childContext = (): AutomationContext => ({ ...context, requestId: `${context.requestId}/${++children}`, target: { ...context.target } });
    const fenced = async <T>(run: () => Promise<T>): Promise<T> => {
      context.signal.throwIfAborted();
      execution.assertCurrent(context.target);
      const result = await run();
      if (context.signal.aborted) throw new ChartCommandError('cancelled');
      execution.assertCurrent(context.target);
      return result;
    };
    const execute = async (name: string, input: unknown = {}): Promise<unknown> => {
      if (depth >= MAX_CHILD_DEPTH) throw new ChartCommandError('limit_exceeded', 'Command nesting is too deep');
      const port = Object.hasOwn(ports, name) ? ports[name]! : undefined;
      if (port) {
        assertLive();
        if (!childEffectAllowed(command.effect, port.effect)) throw new ChartCommandError('unsupported', `A ${command.effect} command cannot run ${name}`);
        assertMessage(input, limits.messageBytes);
        return fenced(() => port.run(structuredClone(input), childContext()));
      }
      const child = lookup(name);
      if (child.targetChange) throw new ChartCommandError('unsupported', 'Target-changing commands cannot run inside another command');
      if (!childEffectAllowed(command.effect, child.effect)) throw new ChartCommandError('unsupported', `A ${command.effect} command cannot run a ${child.effect} command`);
      const parsed = parseInput(child, input);
      const result = await fenced(async () => child.execute(parsed, commandContext(child, childContext(), depth + 1)));
      return validateOutput(child, result);
    };
    return { ...context, execute } as AutomationCommandContext;
  };

  /** Always settles asynchronously: validation failures reject rather than throw. */
  const execute = async (name: string, input: unknown, supplied?: AutomationRequest): Promise<unknown> => {
    const command = lookup(name);
    const request = resolveRequest(supplied);
    const parsed = parseInput(command, input);
    if (command.targetChange === 'synchronous') {
      return execution.runTargetChange(command, request, context => command.execute(parsed, commandContext(command, context, 0)))
        .then(result => validateOutput(command, result));
    }
    return execution.run(command, request, async context => validateOutput(command, await command.execute(parsed, commandContext(command, context, 0))));
  };

  const register = <I, O>(definition: AutomationCommand<I, O>, native: boolean): AutomationRegistration<I, O> => {
    assertLive();
    assertValidDefinition(definition as AutomationCommand, native);
    if (commands.has(definition.name)) throw new ChartCommandError('operation_conflict');
    const owned = ownedCopy(definition as AutomationCommand);
    const name = owned.name;
    const toolName = commandToolName(owned);
    if (toolNames.has(toolName)) throw new ChartCommandError('operation_conflict', `Tool name ${toolName} is already registered`);
    const isCurrent = () => commands.get(name) === owned;
    commands.set(name, owned);
    toolNames.set(toolName, name);
    const live = native ? nativeLiveSchema(definition.input) : undefined;
    if (live) liveInputs.set(owned, { current: live, advertised: JSON.stringify(owned.input.jsonSchema) });
    revision++;
    const unregister = () => {
      if (!isCurrent()) return;
      commands.delete(name);
      toolNames.delete(toolName);
      liveInputs.delete(owned);
      revision++;
      execution.cancel(owned);
      owned.dispose?.();
    };
    return Object.assign(unregister, {
      async execute(input: I, request?: AutomationRequest): Promise<O> {
        if (!isCurrent()) throw new ChartCommandError('unsupported');
        return execute(name, input, request) as Promise<O>;
      },
    });
  };

  return {
    execute,
    register: <I, O>(command: AutomationCommand<I, O>) => register(command, false),
    registerNative: <I, O>(command: AutomationCommand<I, O>) => register(command, true),
    revision: () => { refreshLiveInputs(); return revision; },
    instructions(): string {
      return [...commands.values()]
        .filter(command => command.instructions && allowed(command.name, command.effect))
        .map(command => command.instructions!.trim())
        .join('\n\n');
    },
    descriptors(): AutomationCommandDescriptor[] {
      refreshLiveInputs();
      return [...commands.values()].filter(command => allowed(command.name, command.effect)).map(describe);
    },
    destroy() {
      const registered = [...commands.values()];
      commands.clear();
      toolNames.clear();
      liveInputs.clear();
      disposeAll(registered.map(command => () => command.dispose?.()));
    },
  };
}
