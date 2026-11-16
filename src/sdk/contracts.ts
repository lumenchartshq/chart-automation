import type { ChartBar } from '../core-contracts/index.js';
import type { BuiltinCommandMap, BuiltinCommandName } from './builtin-contracts.js';

/** Public local SDK contracts. No conversation, transport or attachment identity. */
export const AUTOMATION_EFFECTS = ['read', 'mutation', 'external'] as const;
export type AutomationEffect = (typeof AUTOMATION_EFFECTS)[number];
export const AUTOMATION_SERIES_KINDS = ['main', 'comparison', 'study', 'script'] as const;
export const AUTOMATION_SERIES_READINESS = ['ready', 'pending', 'error'] as const;
export const AUTOMATION_EVENT_TYPES = ['selection', 'data', 'study-ready', 'disposed'] as const;
/** Whether a call may overlap other calls in one model step. */
export const AUTOMATION_CONCURRENCY = ['shared', 'exclusive'] as const;
export type AutomationConcurrency = (typeof AUTOMATION_CONCURRENCY)[number];

export interface AutomationTarget {
  id: string;
  /** Changes on selection/replacement, including A -> B -> A. */
  generation: number;
}
export interface AutomationRequest {
  requestId: string;
  target: AutomationTarget;
  signal?: AbortSignal;
  /** Absolute epoch-millisecond deadline; the session ceiling still applies. */
  deadline?: number;
}
export interface AutomationContext extends AutomationRequest { signal: AbortSignal }
/** What a command handler receives: the request context plus child execution. */
export interface AutomationCommandContext extends AutomationContext {
  /**
   * Runs another registered command, or an SDK port (`data.series`,
   * `data.read`, `data.requestHistory`, `capture.image`), as part of this
   * request: same signal, deadline and target fence, a derived request ID and
   * no extra concurrency slot. The child's effect must be `read` or match this
   * command's effect; target-changing commands cannot run as children.
   *
   * Known names (the ports above and built-in commands) are typed: input
   * must match the command's input type, or be statically `unknown` (for
   * example input forwarded from an `AutomationCommand<unknown>`), since the
   * child parses its own input either way. Other names return `unknown`.
   */
  execute(name: 'data.series', input?: Record<string, never>): Promise<AutomationSeries[]>;
  execute(name: 'data.read' | 'data.requestHistory', input: AutomationDataRequest): Promise<AutomationDataResult>;
  execute(name: 'capture.image', input?: Record<string, never>): Promise<AutomationCapture>;
  execute<K extends BuiltinCommandName>(name: K, input: BuiltinCommandMap[K]['input']): Promise<BuiltinCommandMap[K]['output']>;
  execute<X>(name: 'data.series', input: UnknownInput<X>): Promise<AutomationSeries[]>;
  execute<X>(name: 'data.read' | 'data.requestHistory', input: UnknownInput<X>): Promise<AutomationDataResult>;
  execute<X>(name: 'capture.image', input: UnknownInput<X>): Promise<AutomationCapture>;
  execute<K extends BuiltinCommandName, X>(name: K, input: UnknownInput<X>): Promise<BuiltinCommandMap[K]['output']>;
  execute<N extends string>(name: OtherChildName<N>, input?: unknown): Promise<unknown>;
}
/** Matches only an argument typed `unknown` (or `any`). */
type UnknownInput<X> = X & (unknown extends X ? unknown : never);
/** Any name except a typed one, so known names never fall back to `unknown`. */
type OtherChildName<N extends string> = N & (N extends BuiltinCommandName | 'data.series' | 'data.read' | 'data.requestHistory' | 'capture.image' ? never : unknown);
export interface AutomationSchema<T> {
  jsonSchema: Readonly<Record<string, unknown>>;
  /** Must reject unknown/invalid fields; the SDK invokes it at both boundaries. */
  parse(value: unknown): T;
}
export interface AutomationCommand<I = unknown, O = unknown> {
  name: string;
  version: number;
  description: string;
  effect: AutomationEffect;
  /** Explicitly permits a synchronous native navigation commit to change target generation. */
  targetChange?: 'synchronous';
  /** Model guidance joined by `sdk.instructions()`; up to 4,000 characters. */
  instructions?: string;
  /** Valid example inputs, checked against `input` at registration. */
  examples?: readonly AutomationCommandExample[];
  /** Defaults to `shared` for `read`, `exclusive` otherwise. */
  concurrency?: AutomationConcurrency;
  /** snake_case model tool name; defaults to the command name with `.` and camelCase as `_`. */
  toolName?: string;
  input: AutomationSchema<I>;
  output: AutomationSchema<O>;
  execute(input: I, context: AutomationCommandContext): Promise<O> | O;
  /** Invoked once on unregister or session destruction. */
  dispose?(): void;
}
/** Unregisters when called; `request` defaults to a fresh ID and the current target. `execute` only reaches the exact registered command. */
export type AutomationRegistration<I, O> = (() => void) & {
  execute(input: I, request?: AutomationRequest): Promise<O>;
};
export interface AutomationPolicy {
  effects?: readonly AutomationEffect[];
  commands?: readonly string[];
  maxConcurrent?: number;
  deadlineMs?: number;
  messageBytes?: number;
}
/** Effective per-session limits after policy validation. */
export interface AutomationLimits {
  readonly maxConcurrent: number;
  readonly deadlineMs: number;
  readonly messageBytes: number;
}
export interface AutomationCommandExample {
  description?: string;
  input: unknown;
}
export interface AutomationCommandDescriptor {
  name: string;
  version: number;
  description: string;
  effect: AutomationEffect;
  concurrency: AutomationConcurrency;
  toolName: string;
  instructions?: string;
  examples?: AutomationCommandExample[];
  input: Readonly<Record<string, unknown>>;
  output: Readonly<Record<string, unknown>>;
}
export interface AutomationCapabilities {
  version: 1;
  /**
   * Changes whenever commands are registered or unregistered, or a native
   * command's input schema follows a chart change (the custom studies
   * `studies.apply` accepts); rebuild tool lists when it does.
   */
  revision: number;
  limits: AutomationLimits & {
    rows: number;
    series: number;
    fieldsPerSeries: number;
    imageBytes: number;
    imageDimension: number;
  };
  data: boolean;
  history: boolean;
  capture: boolean;
  captureFormats: 'image/png'[];
  captureScopes: 'chart'[];
  commands: AutomationCommandDescriptor[];
}
export interface AutomationSeriesField {
  name: string;
  type: 'number';
  unit?: string;
  optional?: boolean;
  nullable?: boolean;
}
export interface AutomationSeries {
  id: string;
  kind: (typeof AUTOMATION_SERIES_KINDS)[number];
  fields: readonly AutomationSeriesField[];
  timeUnit: 'milliseconds';
  readiness: (typeof AUTOMATION_SERIES_READINESS)[number];
}
/** Inclusive UTC epoch-millisecond window. */
export interface AutomationDataRequest {
  seriesId: string;
  from: number;
  to: number;
  limit: number;
}
export interface AutomationDataResult {
  seriesId: string;
  revision: string;
  rows: readonly (ChartBar | Readonly<Record<string, number | null>>)[];
  coverage: { from: number | null; to: number | null; complete: boolean };
}
export interface AutomationCapture {
  blob: Blob;
  width: number;
  height: number;
  capturedAt: string;
  target: AutomationTarget;
  /** UTC epoch milliseconds. */
  visibleRange: { from: number; to: number } | null;
  /** Opaque renderer/host revision; not a persistence revision. */
  revision: string;
}
export interface AutomationEvent {
  type: (typeof AUTOMATION_EVENT_TYPES)[number];
  target: AutomationTarget;
  revision: string;
}
export interface AutomationHost {
  currentTarget(): AutomationTarget;
  data?: {
    series(): readonly AutomationSeries[];
    read(input: AutomationDataRequest, context: AutomationContext): Promise<AutomationDataResult> | AutomationDataResult;
    /** Host must use its normal provider ingestion and preserve chart selection. */
    requestHistory?(input: AutomationDataRequest, context: AutomationContext): Promise<AutomationDataResult>;
  };
  capture?: { image(context: AutomationContext): Promise<AutomationCapture> };
  /** Must publish only committed changes, not speculative state. */
  subscribe?(listener: (event: AutomationEvent) => void): () => void;
}
