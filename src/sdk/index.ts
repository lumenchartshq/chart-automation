export { ChartCommandError, CHART_ERROR_CODES, type ChartErrorCode } from '../core-contracts/index.js';
export * from './contracts.js';
export { createChartAutomation } from './session.js';
export { defineCommand, type CommandDefinition } from './define-command.js';
export { field, objectSchema, type Field, type Fields, type FieldValues } from './schema.js';
export { defaultToolName } from './tool-names.js';
export type { ChartAutomation } from './chart-automation.js';
export { AUTOMATION_CEILINGS } from './execution.js';
export { decodeChartPng, readChartPng, type ChartPng } from './capture.js';
export { createNativeChartAutomation, type NativeAutomationChart } from './native-chart.js';
export {
  createAutomationTools,
  type AutomationTool, type AutomationToolCall, type AutomationToolInfo, type AutomationToolMiddleware, type AutomationToolOptions,
  type AutomationToolSource,
} from './model-tools.js';
export {
  AUTOMATION_PORT_CALLS, AUTOMATION_REMOTE_VERSION, connectAutomation, parseAutomationRemoteCall, parseAutomationRemoteResult, serveAutomation,
  type AutomationRemoteCall, type AutomationRemoteResult, type AutomationServer, type AutomationSnapshot,
  type AutomationTransport, type RemoteChartAutomation,
} from './remote.js';
export { installNativeAutomationCommands, type NativeCommandOwners, type NativePreparedChange } from './native-commands.js';
export { openNativeChartAutomation, type NativeChartAutomationOptions } from './native-session.js';
export type { BuiltinAutomationFacade, BuiltinCommandMap } from './builtin-contracts.js';
export type { AutomationPage } from './page-schema.js';
export type * from './domain-types.js';

// Field descriptions, unions and records; structured error details.
export { chartErrorDetails, parseChartErrorDetails, CHART_ERROR_DETAIL_LIMITS, type ChartErrorDetails } from '../core-contracts/index.js';
export { AUTOMATION_TOOL_EXAMPLE_LIMITS } from './model-tools.js';
export type { RecordJsonSchema, UnionJsonSchema, UnionValues, UnionVariants } from './schema.js';
