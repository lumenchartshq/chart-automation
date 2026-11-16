import { ChartCommandError } from '../core-contracts/index.js';
import { createAutomationEvents } from './events.js';
import { validateAutomationRead, validateAutomationRows, validateAutomationSeries } from './data-validation.js';
import { validateAutomationCapture } from './capture-validation.js';
import { createCommandRegistry } from './command-registry.js';
import { createBuiltinFacade } from './builtin-contracts.js';
import { connectNativeRegistrar } from './native-registration.js';
import { AUTOMATION_CEILINGS, automationLimits, createExecutionOwner } from './execution.js';
import { disposeAll } from './dispose.js';
import { emptySchema } from './schema.js';
import {
  AUTOMATION_EFFECTS, type AutomationCapabilities, type AutomationContext, type AutomationDataRequest,
  type AutomationDataResult, type AutomationEffect, type AutomationHost, type AutomationPolicy, type AutomationRequest,
} from './contracts.js';
import type { ChartAutomation } from './chart-automation.js';

export type { ChartAutomation } from './chart-automation.js';

/** Policy names for the SDK-owned ports, checked like command names. */
const PORTS = {
  read: { name: 'data.read', effect: 'read' },
  history: { name: 'data.requestHistory', effect: 'external' },
  capture: { name: 'capture.image', effect: 'read' },
} as const satisfies Record<string, { name: string; effect: AutomationEffect }>;

/** A local session. Mutations retain their native receipts; no distributed transaction is implied. */
export function createChartAutomation(host: AutomationHost, policy: AutomationPolicy = {}): ChartAutomation {
  const limits = automationLimits(policy);
  const execution = createExecutionOwner(host, limits);
  const effects = new Set<AutomationEffect>(policy.effects ?? AUTOMATION_EFFECTS);
  const allowedNames = policy.commands ? new Set(policy.commands) : null;
  let disposed = false;

  // Unique per session, not only per millisecond: sessions sharing an adopted
  // native owner must not reuse an ID the owner already holds a receipt for.
  const requestPrefix = `sdk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}-`;
  let requestSequence = 0;

  const assertLive = () => { if (disposed) throw new ChartCommandError('unavailable'); };
  const target = () => ({ ...host.currentTarget() });
  const request = (overrides: Partial<AutomationRequest> = {}): AutomationRequest =>
    ({ requestId: `${requestPrefix}${++requestSequence}`, target: target(), ...overrides });
  const resolveRequest = (supplied?: AutomationRequest) => supplied ?? request();
  const allowed = (name: string, effect: AutomationEffect) => effects.has(effect) && (!allowedNames || allowedNames.has(name));
  const requireCapability = (name: string, effect: AutomationEffect) => {
    assertLive();
    if (!allowed(name, effect)) throw new ChartCommandError('unsupported');
  };
  const requireData = () => {
    if (!host.data) throw new ChartCommandError('unsupported');
    return host.data;
  };
  const seriesSnapshot = () => validateAutomationSeries(requireData().series(), limits.messageBytes);

  type DataProvider = (input: AutomationDataRequest, context: AutomationContext) => Promise<AutomationDataResult> | AutomationDataResult;
  type PortRun = (context: AutomationContext) => Promise<unknown>;
  /** Validates the request and snapshots its series descriptor before any provider runs. */
  const prepareRead = (input: AutomationDataRequest, provider: DataProvider) => {
    const prepared = validateAutomationRead(input, seriesSnapshot());
    const run: PortRun = async context => {
      const result = await provider({ ...prepared.request }, context);
      return validateAutomationRows(prepared.request, result, prepared.series, limits.messageBytes);
    };
    return { run, readiness: prepared.series.readiness };
  };
  /**
   * SDK ports in two steps: synchronous policy and input checks, then the run.
   * Public methods admit the run as a request; commands run it as a child.
   */
  const ports = {
    'data.series': {
      effect: PORTS.read.effect,
      prepare(input: unknown): PortRun {
        requireCapability(PORTS.read.name, PORTS.read.effect);
        emptySchema.parse(input);
        return async () => seriesSnapshot();
      },
    },
    'data.read': {
      effect: PORTS.read.effect,
      prepare(input: unknown): PortRun {
        requireCapability(PORTS.read.name, PORTS.read.effect);
        const data = requireData();
        const { run, readiness } = prepareRead(input as AutomationDataRequest, (stable, context) => data.read(stable, context));
        if (readiness === 'pending') throw new ChartCommandError('busy');
        if (readiness === 'error') throw new ChartCommandError('unavailable');
        return run;
      },
    },
    'data.requestHistory': {
      effect: PORTS.history.effect,
      prepare(input: unknown): PortRun {
        requireCapability(PORTS.history.name, PORTS.history.effect);
        const data = requireData();
        const requestHistory = data.requestHistory;
        const { run } = prepareRead(input as AutomationDataRequest, (stable, context) => requestHistory!.call(data, stable, context));
        if (!requestHistory) throw new ChartCommandError('unsupported');
        return run;
      },
    },
    'capture.image': {
      effect: PORTS.capture.effect,
      prepare(input: unknown): PortRun {
        requireCapability(PORTS.capture.name, PORTS.capture.effect);
        emptySchema.parse(input);
        const capture = host.capture;
        if (!capture) throw new ChartCommandError('unsupported');
        return async context => validateAutomationCapture(await capture.image(context), context.target);
      },
    },
  } as const;
  const portOwners: Record<keyof typeof ports, object> = { 'data.series': {}, 'data.read': {}, 'data.requestHistory': {}, 'capture.image': {} };
  const admitPort = <T>(name: keyof typeof ports, input: unknown, request?: AutomationRequest): Promise<T> =>
    execution.run(portOwners[name], resolveRequest(request), ports[name].prepare(input)) as Promise<T>;
  const childPorts = Object.fromEntries(Object.entries(ports).map(([name, port]) => [name, {
    effect: port.effect,
    run: (input: unknown, context: AutomationContext) => port.prepare(input)(context),
  }]));

  const registry = createCommandRegistry({ execution, limits, assertLive, allowed, requireCapability, resolveRequest, ports: childPorts });
  const events = createAutomationEvents(assertLive, () => session.destroy());

  const capabilities = (): AutomationCapabilities => {
    assertLive();
    const capture = !!host.capture && allowed(PORTS.capture.name, PORTS.capture.effect);
    return {
      version: 1,
      revision: registry.revision(),
      limits: {
        ...limits,
        rows: AUTOMATION_CEILINGS.rows,
        series: AUTOMATION_CEILINGS.series,
        fieldsPerSeries: AUTOMATION_CEILINGS.fieldsPerSeries,
        imageBytes: AUTOMATION_CEILINGS.imageBytes,
        imageDimension: AUTOMATION_CEILINGS.imageDimension,
      },
      data: !!host.data && allowed(PORTS.read.name, PORTS.read.effect),
      history: !!host.data?.requestHistory && allowed(PORTS.history.name, PORTS.history.effect),
      capture,
      captureFormats: capture ? ['image/png'] : [],
      captureScopes: capture ? ['chart'] : [],
      commands: registry.descriptors(),
    };
  };

  const session: ChartAutomation = {
    capabilities,
    target,
    request,
    data: {
      series() {
        requireCapability(PORTS.read.name, PORTS.read.effect);
        return seriesSnapshot();
      },
      read: async (input, request) => admitPort('data.read', input, request),
      requestHistory: async (input, request) => admitPort('data.requestHistory', input, request),
    },
    capture: {
      image: async request => admitPort('capture.image', {}, request),
    },
    events: { subscribe: events.subscribe },
    ...createBuiltinFacade(registry.execute),
    extensions: { register: registry.register },
    execute: registry.execute,
    instructions: () => {
      assertLive();
      return registry.instructions();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      execution.destroy();
      disposeAll([events.destroy, registry.destroy]);
    },
    close: () => session.destroy(),
  };
  events.start(host);
  connectNativeRegistrar(session, registry.registerNative);
  return session;
}
