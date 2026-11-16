import type { ChartContext, DrawingOperation, DrawingReceipt, DrawingSummary } from '../contracts.js';
import type { ChartStudyContext, StudyList, StudyOperation, StudyReceipt } from '../studies.js';
import type { ChartSettingsIntent, ChartSettingsReceipt } from '../chart-settings.js';
import type { CapabilityCatalogDetail, CapabilityCatalogPage, CapabilityCatalogQuery, InspectedChart, InspectedDrawing, InspectedStudy } from '../capabilities.js';
import type { DrawingGroupSummary } from '../organization.js';
import type { WorkspaceContext, WorkspaceDocument } from '../workspace.js';
import type { AutomationCommand, AutomationRequest } from './contracts.js';
import type { AutomationPage } from './page-schema.js';

/** Built-in commands with a typed facade method. */
export interface BuiltinCommandMap {
  'drawings.context': { input: Record<string, never>; output: ChartContext };
  'drawings.list': { input: AutomationPage; output: { drawings: DrawingSummary[]; total: number } };
  'drawings.apply': { input: { operations: DrawingOperation[] }; output: DrawingReceipt };
  'drawings.groups': { input: AutomationPage; output: { groups: DrawingGroupSummary[]; total: number } };
  'drawings.inspect': { input: { id: string }; output: { drawing: InspectedDrawing | null } };
  'studies.context': { input: Record<string, never>; output: ChartStudyContext };
  'studies.list': { input: AutomationPage; output: StudyList };
  'studies.apply': { input: { operations: StudyOperation[]; expectedRevision: number }; output: StudyReceipt };
  'studies.inspect': { input: { id: string }; output: { study: InspectedStudy | null } };
  'settings.inspect': { input: Record<string, never>; output: InspectedChart };
  'settings.apply': { input: ChartSettingsIntent; output: ChartSettingsReceipt };
  'workspace.context': { input: Record<string, never>; output: WorkspaceContext };
  'workspace.apply': { input: WorkspaceDocument; output: WorkspaceDocument };
}
/** Every command only the native adapter may install. */
export interface NativeCommandMap extends BuiltinCommandMap {
  'capabilities.query': { input: CapabilityCatalogQuery; output: CapabilityCatalogPage | CapabilityCatalogDetail };
}
export type BuiltinCommandName = keyof BuiltinCommandMap;
export type NativeCommandName = keyof NativeCommandMap;
export type NativeCommand<K extends NativeCommandName> =
  AutomationCommand<NativeCommandMap[K]['input'], NativeCommandMap[K]['output']> & { name: K };

// A record (not a list) so adding a command to the map without listing it fails typechecking.
const NATIVE_COMMANDS: Record<NativeCommandName, true> = {
  'capabilities.query': true,
  'drawings.context': true, 'drawings.list': true, 'drawings.apply': true, 'drawings.groups': true, 'drawings.inspect': true,
  'studies.context': true, 'studies.list': true, 'studies.apply': true, 'studies.inspect': true,
  'settings.inspect': true, 'settings.apply': true,
  'workspace.context': true, 'workspace.apply': true,
};
export const NATIVE_COMMAND_NAMES: ReadonlySet<string> = new Set(Object.keys(NATIVE_COMMANDS));
const commandNamespace = (name: string) => name.slice(0, name.indexOf('.'));
/** Namespaces public extensions cannot use: SDK-owned ports plus every native namespace. */
export const RESERVED_NAMESPACES: ReadonlySet<string> = new Set(['data', 'capture', 'sdk', ...[...NATIVE_COMMAND_NAMES].map(commandNamespace)]);
export function isReservedCommandName(name: string): boolean {
  return RESERVED_NAMESPACES.has(commandNamespace(name));
}

type Output<K extends BuiltinCommandName> = Promise<BuiltinCommandMap[K]['output']>;
type Input<K extends BuiltinCommandName> = BuiltinCommandMap[K]['input'];
export interface BuiltinAutomationFacade {
  drawings: {
    context(request?: AutomationRequest): Output<'drawings.context'>;
    list(input: Input<'drawings.list'>, request?: AutomationRequest): Output<'drawings.list'>;
    apply(input: Input<'drawings.apply'>, request?: AutomationRequest): Output<'drawings.apply'>;
    groups(input: Input<'drawings.groups'>, request?: AutomationRequest): Output<'drawings.groups'>;
    inspect(input: Input<'drawings.inspect'>, request?: AutomationRequest): Output<'drawings.inspect'>;
  };
  studies: {
    context(request?: AutomationRequest): Output<'studies.context'>;
    list(input: Input<'studies.list'>, request?: AutomationRequest): Output<'studies.list'>;
    apply(input: Input<'studies.apply'>, request?: AutomationRequest): Output<'studies.apply'>;
    inspect(input: Input<'studies.inspect'>, request?: AutomationRequest): Output<'studies.inspect'>;
  };
  settings: {
    inspect(request?: AutomationRequest): Output<'settings.inspect'>;
    apply(input: Input<'settings.apply'>, request?: AutomationRequest): Output<'settings.apply'>;
  };
  workspace: {
    context(request?: AutomationRequest): Output<'workspace.context'>;
    apply(document: Input<'workspace.apply'>, request?: AutomationRequest): Output<'workspace.apply'>;
  };
}

type Execute = (name: string, input: unknown, request?: AutomationRequest) => Promise<unknown>;

/** Typed calls over the registry. Outputs are validated by the native command's output schema. */
export function createBuiltinFacade(execute: Execute): BuiltinAutomationFacade {
  const call = <K extends BuiltinCommandName>(name: K, input: Input<K>, request?: AutomationRequest) =>
    execute(name, input, request) as Output<K>;
  return {
    drawings: {
      context: request => call('drawings.context', {}, request),
      list: (input, request) => call('drawings.list', input, request),
      apply: (input, request) => call('drawings.apply', input, request),
      groups: (input, request) => call('drawings.groups', input, request),
      inspect: (input, request) => call('drawings.inspect', input, request),
    },
    studies: {
      context: request => call('studies.context', {}, request),
      list: (input, request) => call('studies.list', input, request),
      apply: (input, request) => call('studies.apply', input, request),
      inspect: (input, request) => call('studies.inspect', input, request),
    },
    settings: {
      inspect: request => call('settings.inspect', {}, request),
      apply: (input, request) => call('settings.apply', input, request),
    },
    workspace: {
      context: request => call('workspace.context', {}, request),
      apply: (document, request) => call('workspace.apply', document, request),
    },
  };
}
