import { ChartCommandError, chartCommandErrorCode, chartErrorDetails, type ChartErrorCode } from '../core-contracts/index.js';
import type {
  AutomationCapabilities, AutomationCapture, AutomationCommandExample, AutomationConcurrency, AutomationDataRequest,
  AutomationDataResult, AutomationEffect, AutomationRequest, AutomationSeries,
} from './contracts.js';
import { dataRequestSchema } from './data-validation.js';
import { emptySchema } from './schema.js';
import { PORT_TOOL_NAMES, TOOL_NAME } from './tool-names.js';

/** What tools need from a session: a local `ChartAutomation` or a `RemoteChartAutomation`. */
export interface AutomationToolSource<C = AutomationCapture> {
  capabilities(): AutomationCapabilities;
  request(overrides?: Partial<AutomationRequest>): AutomationRequest;
  execute(name: string, input: unknown, request?: AutomationRequest): Promise<unknown>;
  data: {
    series(): AutomationSeries[] | Promise<AutomationSeries[]>;
    read(input: AutomationDataRequest, request?: AutomationRequest): Promise<AutomationDataResult>;
    requestHistory(input: AutomationDataRequest, request?: AutomationRequest): Promise<AutomationDataResult>;
  };
  capture: { image(request?: AutomationRequest): Promise<C> };
}

export interface AutomationToolInfo {
  /** Provider-safe snake_case name. */
  name: string;
  /** The SDK command or port this tool calls, e.g. `drawings.apply` or `data.read`. */
  commandName: string;
  description: string;
  parameters: Readonly<Record<string, unknown>>;
  effect: AutomationEffect;
  /** Whether the call may overlap other `shared` calls in one model step. */
  concurrency: AutomationConcurrency;
}
export interface AutomationTool extends AutomationToolInfo {
  execute(toolCallId: string, input: unknown): Promise<unknown>;
}
export interface AutomationToolCall {
  tool: AutomationToolInfo;
  toolCallId: string;
  input: unknown;
  request: AutomationRequest;
}
/**
 * Wraps every tool call: log, audit, ask for confirmation, enforce budgets or
 * transform results. Call `next()` to continue; throw a `ChartCommandError`
 * to refuse the call.
 */
export type AutomationToolMiddleware = (call: AutomationToolCall, next: () => Promise<unknown>) => Promise<unknown>;

export interface AutomationToolOptions<C = AutomationCapture> {
  /** Request envelope for a tool call; defaults to the call ID and the current target. */
  request?: (toolCallId: string) => AutomationRequest;
  /** Keep only tools for which this returns true. */
  include?: (tool: AutomationToolInfo) => boolean;
  /** Prepended to every derived tool name (not to `toolNames` overrides). */
  toolPrefix?: string;
  /** Exact tool names by command name, e.g. `{ 'drawings.apply': 'apply_chart_drawing_batch' }`. */
  toolNames?: Readonly<Record<string, string>>;
  /** Outermost first. */
  use?: readonly AutomationToolMiddleware[];
  /**
   * Replaces a tool's model-facing description or parameters, for example to
   * keep evaluated wording. Runs before `include` and name validation; return
   * `undefined` to keep the tool as derived. Input is still parsed by the
   * command's own schema, so replaced parameters must describe what it accepts.
   */
  describe?: (tool: AutomationToolInfo) => Partial<Pick<AutomationToolInfo, 'description' | 'parameters'>> | undefined;
  /** Converts a capture for your provider; capture is advertised only when supplied. */
  imageResult?: (capture: C) => Promise<unknown> | unknown;
  /**
   * Result returned for a failed call. Defaults to `{ error: code, details? }`
   * with a chart error code and, for rejected input, the field path and a fixed
   * reason (`chartErrorDetails(error)`); never the error message. `null`
   * rethrows instead.
   */
  errorResult?: ((code: ChartErrorCode, error: unknown) => unknown) | null;
}

const defaultErrorResult = (code: ChartErrorCode, error: unknown) => {
  const details = chartErrorDetails(error);
  return details ? { error: code, details } : { error: code };
};

/** Bounds for examples appended to a tool description. */
export const AUTOMATION_TOOL_EXAMPLE_LIMITS = { exampleChars: 600, totalChars: 2000 } as const;

/**
 * Appends a command's registered examples to its tool description as compact
 * JSON, one line each, so local and remote sessions advertise the same text.
 * Lines over the per-example bound are skipped; lines stop at the total bound.
 * Commands without examples keep their description unchanged.
 */
function withExamples(description: string, examples: readonly AutomationCommandExample[] | undefined): string {
  if (!examples?.length) return description;
  const lines: string[] = [];
  let total = 0;
  for (const example of examples) {
    const json = JSON.stringify(example.input);
    if (json === undefined) continue;
    const label = typeof example.description === 'string' ? example.description.replace(/\s+/g, ' ').trim() : '';
    const line = `- ${label ? `${label}: ` : ''}${json}`;
    if (line.length > AUTOMATION_TOOL_EXAMPLE_LIMITS.exampleChars) continue;
    if (total + line.length + 1 > AUTOMATION_TOOL_EXAMPLE_LIMITS.totalChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.length ? `${description}\n\nExamples:\n${lines.join('\n')}` : description;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function described(definition: ToolDefinition, describe: AutomationToolOptions['describe']): ToolDefinition {
  const override = describe?.(info(definition));
  if (override === undefined) return definition;
  const { description, parameters } = override;
  if (description !== undefined && (typeof description !== 'string' || !description.trim()))
    throw new ChartCommandError('invalid_input', `Invalid description override for ${definition.commandName}`);
  if (parameters !== undefined && !isPlainObject(parameters))
    throw new ChartCommandError('invalid_input', `Invalid parameters override for ${definition.commandName}`);
  return {
    ...definition,
    ...(description !== undefined ? { description } : {}),
    ...(parameters !== undefined ? { parameters: structuredClone(parameters) } : {}),
  };
}

interface ToolDefinition extends AutomationToolInfo {
  run(input: unknown, request: AutomationRequest): Promise<unknown>;
}

/**
 * Model-vendor-neutral adapter. Host owns IDs, budgets, prompts and image transport.
 *
 * The list is a snapshot of the session's commands and policy when called.
 * Rebuild it when `sdk.capabilities().revision` changes.
 */
export function createAutomationTools<C = AutomationCapture>(sdk: AutomationToolSource<C>, options?: AutomationToolOptions<C>): AutomationTool[];
/** @deprecated Pass `{ request, imageResult }` as the options object. */
export function createAutomationTools<C = AutomationCapture>(sdk: AutomationToolSource<C>, request: (toolCallId: string) => AutomationRequest, options?: Omit<AutomationToolOptions<C>, 'request'>): AutomationTool[];
export function createAutomationTools<C = AutomationCapture>(
  sdk: AutomationToolSource<C>,
  requestOrOptions: AutomationToolOptions<C> | ((toolCallId: string) => AutomationRequest) = {},
  legacy: Omit<AutomationToolOptions<C>, 'request'> = {},
): AutomationTool[] {
  const options: AutomationToolOptions<C> = typeof requestOrOptions === 'function' ? { ...legacy, request: requestOrOptions } : requestOrOptions;
  const request = options.request ?? ((toolCallId: string) => sdk.request({ requestId: toolCallId }));
  const prefix = options.toolPrefix ?? '';
  const nameFor = (commandName: string, derived: string) => options.toolNames?.[commandName] ?? `${prefix}${derived}`;
  const capabilities = sdk.capabilities();

  const definitions: ToolDefinition[] = capabilities.commands.map(command => ({
    name: nameFor(command.name, command.toolName),
    commandName: command.name,
    description: withExamples(command.description, command.examples),
    parameters: command.input,
    effect: command.effect,
    concurrency: command.concurrency,
    run: (input, envelope) => sdk.execute(command.name, input, envelope),
  }));
  if (capabilities.data) {
    definitions.push({
      name: nameFor('data.series', PORT_TOOL_NAMES.series),
      commandName: 'data.series',
      description: 'Discover readable series IDs, declared fields, optional/nullable values, time units and calculation readiness before requesting data.',
      parameters: emptySchema.jsonSchema,
      effect: 'read',
      concurrency: 'shared',
      run: async input => {
        emptySchema.parse(input);
        return sdk.data.series();
      },
    }, {
      name: nameFor('data.read', PORT_TOOL_NAMES.read),
      commandName: 'data.read',
      description: 'Read bounded loaded chart rows in UTC milliseconds. Missing coverage is explicit.',
      parameters: dataRequestSchema.jsonSchema,
      effect: 'read',
      concurrency: 'shared',
      run: async (input, envelope) => sdk.data.read(dataRequestSchema.parse(input), envelope),
    });
  }
  if (capabilities.history) {
    definitions.push({
      name: nameFor('data.requestHistory', PORT_TOOL_NAMES.history),
      commandName: 'data.requestHistory',
      description: 'Explicitly request bounded history through the configured host provider.',
      parameters: dataRequestSchema.jsonSchema,
      effect: 'external',
      concurrency: 'exclusive',
      run: async (input, envelope) => sdk.data.requestHistory(dataRequestSchema.parse(input), envelope),
    });
  }
  const imageResult = options.imageResult;
  if (capabilities.capture && imageResult) {
    definitions.push({
      name: nameFor('capture.image', PORT_TOOL_NAMES.capture),
      commandName: 'capture.image',
      description: 'Capture the exact current chart through the host image adapter.',
      parameters: emptySchema.jsonSchema,
      effect: 'read',
      concurrency: 'shared',
      run: async (input, envelope) => {
        emptySchema.parse(input);
        return imageResult(await sdk.capture.image(envelope));
      },
    });
  }

  const selected = definitions
    .map(definition => described(definition, options.describe))
    .filter(definition => options.include?.(info(definition)) ?? true);
  const names = new Set<string>();
  for (const definition of selected) {
    if (!TOOL_NAME.test(definition.name)) throw new ChartCommandError('invalid_input', `Invalid tool name ${definition.name}`);
    if (names.has(definition.name)) throw new ChartCommandError('operation_conflict', `Duplicate tool name ${definition.name}`);
    names.add(definition.name);
  }

  const middleware = options.use ?? [];
  const errorResult = options.errorResult === undefined ? defaultErrorResult : options.errorResult;
  return selected.map(definition => ({
      ...info(definition),
      async execute(toolCallId, input) {
        try {
          const envelope = request(toolCallId);
          const call: AutomationToolCall = { tool: info(definition), toolCallId, input, request: envelope };
          const dispatch = (index: number): Promise<unknown> => {
            const step = middleware[index];
            if (!step) return definition.run(input, envelope);
            return step(call, () => dispatch(index + 1));
          };
          return await dispatch(0);
        } catch (error) {
          if (errorResult === null) throw error;
          return errorResult(chartCommandErrorCode(error), error);
        }
      },
    }));
}

function info({ name, commandName, description, parameters, effect, concurrency }: ToolDefinition): AutomationToolInfo {
  return { name, commandName, description, parameters, effect, concurrency };
}
