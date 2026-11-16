import {
  CHART_ERROR_CODES, ChartCommandError, chartCommandErrorCode, chartErrorDetails, parseChartErrorDetails,
  type ChartErrorCode, type ChartErrorDetails,
} from '../core-contracts/index.js';
import type {
  AutomationCapabilities, AutomationCapture, AutomationDataRequest, AutomationDataResult, AutomationRequest,
  AutomationSeries, AutomationTarget,
} from './contracts.js';
import type { ChartAutomation } from './chart-automation.js';
import { createBuiltinFacade, type BuiltinAutomationFacade } from './builtin-contracts.js';
import { AUTOMATION_CEILINGS, assertMessage } from './execution.js';

/**
 * Remote sessions let a model run on a server while the chart stays in the
 * browser. The chart side serves a local session (`serveAutomation`); the
 * model side connects to it with `connectAutomation`. The host supplies the
 * transport and owns delivery, durable replay by `requestId`, rejecting a
 * known ID with different input, and cancellation.
 */
export const AUTOMATION_REMOTE_VERSION = 1 as const;

/** Names the remote protocol routes to SDK ports instead of commands. */
export const AUTOMATION_PORT_CALLS = ['data.series', 'data.read', 'data.requestHistory', 'capture.image'] as const;

export interface AutomationSnapshot {
  version: typeof AUTOMATION_REMOTE_VERSION;
  target: AutomationTarget;
  capabilities: AutomationCapabilities;
  instructions: string;
}
export interface AutomationRemoteCall {
  version: typeof AUTOMATION_REMOTE_VERSION;
  requestId: string;
  target: AutomationTarget;
  /** A command name or one of `AUTOMATION_PORT_CALLS`. */
  name: string;
  /** The command version the caller was built against; mismatches reject with `unsupported`. */
  commandVersion?: number;
  input: unknown;
  /** Relative, so server and browser clocks need not agree. */
  timeoutMs?: number;
}
export type AutomationRemoteResult =
  | { version: typeof AUTOMATION_REMOTE_VERSION; ok: true; value: unknown; target: AutomationTarget | null }
  | {
    version: typeof AUTOMATION_REMOTE_VERSION; ok: false; code: ChartErrorCode; target: AutomationTarget | null;
    /** Where rejected input failed; optional, so older peers ignore it. Bounded and validated on parse. */
    details?: ChartErrorDetails;
  };

export interface AutomationTransport {
  send(call: AutomationRemoteCall, signal: AbortSignal): Promise<AutomationRemoteResult>;
}

export interface AutomationServer {
  /** Send this to the model side at the start of a turn, and again after `capabilities().revision` changes. */
  snapshot(): AutomationSnapshot;
  /** Executes one call; never rejects. */
  handle(call: unknown, signal?: AbortSignal): Promise<AutomationRemoteResult>;
}

const MAX_NAME_LENGTH = 128;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isTarget = (value: unknown): value is AutomationTarget =>
  isRecord(value) && typeof value.id === 'string' && Number.isSafeInteger(value.generation);

/** Validates a call envelope; rejects with `unsupported` or `invalid_input`. Durable transports use it before storing a call. */
export function parseAutomationRemoteCall(value: unknown): AutomationRemoteCall {
  if (!isRecord(value) || value.version !== AUTOMATION_REMOTE_VERSION) throw new ChartCommandError('unsupported');
  const { requestId, target, name, commandVersion, timeoutMs } = value;
  if (typeof requestId !== 'string' || !isTarget(target)) throw new ChartCommandError('invalid_input');
  if (typeof name !== 'string' || !name || name.length > MAX_NAME_LENGTH) throw new ChartCommandError('invalid_input');
  if (commandVersion !== undefined && (!Number.isSafeInteger(commandVersion) || (commandVersion as number) < 1)) throw new ChartCommandError('invalid_input');
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > AUTOMATION_CEILINGS.deadlineMs))
    throw new ChartCommandError('invalid_input');
  return value as unknown as AutomationRemoteCall;
}

/**
 * Serves a local session to a remote caller. Capture is offered only with
 * `captureResult`, which turns the PNG into something the transport can carry
 * (for example an upload ID).
 */
export function serveAutomation(sdk: ChartAutomation, options: {
  captureResult?: (capture: AutomationCapture, call: AutomationRemoteCall, signal: AbortSignal) => Promise<unknown> | unknown;
} = {}): AutomationServer {
  const { captureResult } = options;
  const currentTarget = () => { try { return sdk.target(); } catch { return null; } };
  const portVersion = 1;

  const run = (call: AutomationRemoteCall, request: AutomationRequest): Promise<unknown> => {
    const descriptor = sdk.capabilities().commands.find(command => command.name === call.name);
    const expected = descriptor?.version ?? (AUTOMATION_PORT_CALLS.includes(call.name as never) ? portVersion : undefined);
    if (call.commandVersion !== undefined && expected !== undefined && call.commandVersion !== expected) throw new ChartCommandError('unsupported');
    switch (call.name) {
      case 'data.series':
        return Promise.resolve(sdk.data.series());
      case 'data.read':
        return sdk.data.read(call.input as AutomationDataRequest, request);
      case 'data.requestHistory':
        return sdk.data.requestHistory(call.input as AutomationDataRequest, request);
      case 'capture.image':
        if (!captureResult) throw new ChartCommandError('unsupported');
        return sdk.capture.image(request).then(capture => captureResult(capture, call, request.signal!));
      default:
        return sdk.execute(call.name, call.input, request);
    }
  };

  return {
    snapshot() {
      const capabilities = sdk.capabilities();
      const capture = capabilities.capture && !!captureResult;
      return {
        version: AUTOMATION_REMOTE_VERSION,
        target: sdk.target(),
        capabilities: {
          ...capabilities,
          capture,
          captureFormats: capture ? capabilities.captureFormats : [],
          captureScopes: capture ? capabilities.captureScopes : [],
        },
        instructions: sdk.instructions(),
      };
    },
    async handle(value, signal) {
      let cleanup = () => {};
      try {
        const call = parseAutomationRemoteCall(value);
        // Capture conversion may upload bytes after the SDK capture completes.
        // Keep that work under the same cancellation and deadline as the call.
        const controller = new AbortController();
        let timedOut = false;
        const abort = () => controller.abort();
        const timer = call.timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; abort(); }, call.timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        cleanup = () => { if (timer !== undefined) clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        if (controller.signal.aborted) throw new ChartCommandError('cancelled');
        const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort',
          () => reject(new ChartCommandError(timedOut ? 'expired' : 'cancelled')), { once: true }));
        const request: AutomationRequest = {
          requestId: call.requestId,
          target: call.target,
          signal: controller.signal,
          ...(call.timeoutMs !== undefined ? { deadline: Date.now() + call.timeoutMs } : {}),
        };
        const result = await Promise.race([run(call, request), cancelled]);
        return { version: AUTOMATION_REMOTE_VERSION, ok: true, value: result, target: currentTarget() };
      } catch (error) {
        const details = chartErrorDetails(error);
        return { version: AUTOMATION_REMOTE_VERSION, ok: false, code: chartCommandErrorCode(error), target: currentTarget(), ...(details ? { details } : {}) };
      } finally {
        cleanup();
      }
    },
  };
}

/** The model-side session: the same command facade, with port results carried by the transport. */
export interface RemoteChartAutomation extends BuiltinAutomationFacade {
  capabilities(): AutomationCapabilities;
  target(): AutomationTarget;
  request(overrides?: Partial<AutomationRequest>): AutomationRequest;
  instructions(): string;
  data: {
    series(): Promise<AutomationSeries[]>;
    read(input: AutomationDataRequest, request?: AutomationRequest): Promise<AutomationDataResult>;
    requestHistory(input: AutomationDataRequest, request?: AutomationRequest): Promise<AutomationDataResult>;
  };
  /** Resolves to whatever the chart side's `captureResult` returned. */
  capture: { image(request?: AutomationRequest): Promise<unknown> };
  execute(name: string, input: unknown, request?: AutomationRequest): Promise<unknown>;
  /** Replaces the snapshot, for example after the chart side reports a new revision. */
  update(snapshot: AutomationSnapshot): void;
  /** Aborts in-flight calls; later calls reject with `unavailable`. */
  destroy(): void;
  close(): void;
}

/** Validates a result envelope; unknown error codes become `unavailable` and invalid `details` are dropped. */
export function parseAutomationRemoteResult(value: unknown): AutomationRemoteResult {
  if (!isRecord(value) || value.version !== AUTOMATION_REMOTE_VERSION || typeof value.ok !== 'boolean') throw new ChartCommandError('unavailable');
  const target = value.target === null || isTarget(value.target) ? value.target : null;
  if (value.ok) return { version: AUTOMATION_REMOTE_VERSION, ok: true, value: value.value, target };
  const code = CHART_ERROR_CODES.includes(value.code as ChartErrorCode) ? value.code as ChartErrorCode : 'unavailable';
  const details = parseChartErrorDetails(value.details);
  return { version: AUTOMATION_REMOTE_VERSION, ok: false, code, target, ...(details ? { details } : {}) };
}

function assertSnapshot(snapshot: AutomationSnapshot): void {
  if (!isRecord(snapshot) || snapshot.version !== AUTOMATION_REMOTE_VERSION || !isTarget(snapshot.target) || !isRecord(snapshot.capabilities))
    throw new ChartCommandError('unsupported');
}

export function connectAutomation(initial: AutomationSnapshot, transport: AutomationTransport): RemoteChartAutomation {
  assertSnapshot(initial);
  let snapshot = structuredClone(initial);
  let target = { ...snapshot.target };
  let disposed = false;
  const inFlight = new Set<AbortController>();
  const requestPrefix = `remote-${Date.now().toString(36)}-`;
  let requestSequence = 0;

  const assertLive = () => { if (disposed) throw new ChartCommandError('unavailable'); };
  const request = (overrides: Partial<AutomationRequest> = {}): AutomationRequest =>
    ({ requestId: `${requestPrefix}${++requestSequence}`, target: { ...target }, ...overrides });

  const call = async (name: string, input: unknown, supplied?: AutomationRequest): Promise<unknown> => {
    assertLive();
    const envelope = supplied ?? request();
    const { limits } = snapshot.capabilities;
    assertMessage(input, limits.messageBytes);
    const deadline = Math.min(envelope.deadline ?? Infinity, Date.now() + limits.deadlineMs);
    const timeoutMs = Math.floor(deadline - Date.now());
    if (timeoutMs < 1) throw new ChartCommandError('expired');
    if (envelope.signal?.aborted) throw new ChartCommandError('cancelled');
    const version = snapshot.capabilities.commands.find(command => command.name === name)?.version;
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    envelope.signal?.addEventListener('abort', abort, { once: true });
    inFlight.add(controller);
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort',
      () => reject(new ChartCommandError(timedOut ? 'expired' : disposed ? 'unavailable' : 'cancelled')), { once: true }));
    aborted.catch(() => {});
    try {
      const sent = Promise.resolve().then(() => transport.send({
        version: AUTOMATION_REMOTE_VERSION,
        requestId: envelope.requestId,
        target: { ...envelope.target },
        name,
        ...(version !== undefined ? { commandVersion: version } : {}),
        input,
        timeoutMs,
      }, controller.signal));
      // After a timeout or cancellation wins the race, a late transport rejection is expected.
      sent.catch(() => {});
      let reply: unknown;
      try {
        reply = await Promise.race([sent, aborted]);
      } catch (error) {
        // Transport failures surface as codes only, like chart-side errors.
        throw error instanceof ChartCommandError ? error : new ChartCommandError(chartCommandErrorCode(error));
      }
      const result = parseAutomationRemoteResult(reply);
      if (result.target) target = { ...result.target };
      if (!result.ok) throw new ChartCommandError(result.code, result.code, result.details);
      return result.value;
    } finally {
      clearTimeout(timer);
      envelope.signal?.removeEventListener('abort', abort);
      inFlight.delete(controller);
    }
  };

  const session: RemoteChartAutomation = {
    capabilities: () => { assertLive(); return structuredClone(snapshot.capabilities); },
    target: () => { assertLive(); return { ...target }; },
    request: overrides => { assertLive(); return request(overrides); },
    instructions: () => { assertLive(); return snapshot.instructions; },
    data: {
      series: () => call('data.series', {}) as Promise<AutomationSeries[]>,
      read: (input, envelope) => call('data.read', input, envelope) as Promise<AutomationDataResult>,
      requestHistory: (input, envelope) => call('data.requestHistory', input, envelope) as Promise<AutomationDataResult>,
    },
    capture: { image: envelope => call('capture.image', {}, envelope) },
    ...createBuiltinFacade((name, input, envelope) => call(name, input, envelope)),
    execute: call,
    update(next) {
      assertLive();
      assertSnapshot(next);
      snapshot = structuredClone(next);
      target = { ...next.target };
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const controller of inFlight) controller.abort();
      inFlight.clear();
    },
    close: () => session.destroy(),
  };
  return session;
}
