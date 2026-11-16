import type { BuiltinAutomationFacade } from './builtin-contracts.js';
import type {
  AutomationCapabilities, AutomationCapture, AutomationCommand, AutomationDataRequest, AutomationDataResult,
  AutomationEvent, AutomationRegistration, AutomationRequest, AutomationSeries, AutomationTarget,
} from './contracts.js';

/**
 * The public local session. Declared explicitly so internal composition cannot
 * silently change the published surface.
 *
 * Every `request` argument is optional: omitted, the session uses a fresh
 * request ID and the current target. Pass an explicit envelope when the work
 * must be fenced against the target a caller observed earlier (AI tool calls,
 * remote requests).
 */
export interface ChartAutomation extends BuiltinAutomationFacade {
  capabilities(): AutomationCapabilities;
  /** The chart identity and generation that requests are currently fenced against. */
  target(): AutomationTarget;
  /** A fresh request envelope for the current target, with optional overrides. */
  request(overrides?: Partial<AutomationRequest>): AutomationRequest;
  data: {
    series(): AutomationSeries[];
    read(input: AutomationDataRequest, request?: AutomationRequest): Promise<AutomationDataResult>;
    requestHistory(input: AutomationDataRequest, request?: AutomationRequest): Promise<AutomationDataResult>;
  };
  capture: {
    image(request?: AutomationRequest): Promise<AutomationCapture>;
  };
  events: {
    /** Returns an unsubscribe function; payloads are frozen. */
    subscribe(listener: (event: AutomationEvent) => void): () => void;
  };
  extensions: {
    register<I, O>(command: AutomationCommand<I, O>): AutomationRegistration<I, O>;
  };
  execute(name: string, input: unknown, request?: AutomationRequest): Promise<unknown>;
  /** Model guidance from permitted commands' `instructions`, in registration order. */
  instructions(): string;
  /** Idempotent. Runs every disposer and rethrows the first failure. */
  destroy(): void;
  /** Alias of `destroy`. */
  close(): void;
}
