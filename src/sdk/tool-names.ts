import type { AutomationCommand, AutomationConcurrency } from './contracts.js';

/** Provider-safe snake_case: OpenAI and Anthropic accept `[a-zA-Z0-9_-]{1,64}`. */
export const TOOL_NAME = /^[a-z][a-z0-9_-]{0,63}$/;

/** Tool names of the SDK-owned ports; no command may claim them. */
export const PORT_TOOL_NAMES = Object.freeze({
  series: 'data_series',
  read: 'data_read',
  history: 'data_request_history',
  capture: 'capture_image',
} as const);
export const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set(Object.values(PORT_TOOL_NAMES));

/** `drawings.apply` → `drawings_apply`, `navigation.searchSymbols` → `navigation_search_symbols`. */
export function defaultToolName(commandName: string): string {
  return commandName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[.-]/g, '_').toLowerCase();
}

export function commandToolName(command: Pick<AutomationCommand, 'name' | 'toolName'>): string {
  return command.toolName ?? defaultToolName(command.name);
}

export function commandConcurrency(command: Pick<AutomationCommand, 'effect' | 'concurrency'>): AutomationConcurrency {
  return command.concurrency ?? (command.effect === 'read' ? 'shared' : 'exclusive');
}
