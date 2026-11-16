import { ChartCommandError, assertBytes } from './contracts.js';
import { CHART_CAPABILITIES } from './generated/capability-snapshot.js';
import type { ChartSettingsCapability, InspectedChart } from './capabilities.js';
import { validateCapabilityFields } from './capability-fields.js';

export const CHART_SETTINGS_VERSION = 1 as const;
/** Public main price scale modes, in native `PriceScaleMode` order. */
export const CHART_SETTINGS_LIMITS = { changesPerTurn: 10 } as const;
/** Public main price scale modes, in native `PriceScaleMode` order. */
export const CHART_SCALE_MODES = ['normal', 'log', 'percent', 'indexed'] as const;
export type ChartScaleMode = typeof CHART_SCALE_MODES[number];

/** Field ids of the chart capability; values follow its descriptors. */
export type ChartSettings = Record<string, string | boolean>;
/** Settings target the turn's bound (active) chart; switch charts with the workspace tools first. */
export interface ChartSettingsIntent { settings: ChartSettings }
/** Inspection id of the active chart's settings. */
export const CHART_SETTINGS_TARGET = 'active' as const;
/**
 * Chart settings are applied to the open chart only. They are not saved, so a
 * receipt is always `applied` with `saved: false`; reopening restores defaults,
 * as it does after a person's change.
 */
export interface ChartSettingsReceipt {
  version: 1;
  operationId: string;
  chartId: string;
  state: 'applied';
  saved: false;
  /** Effective values of every chart field after the change. */
  values: ChartSettings;
  /** Whether the change has a native Undo entry. */
  undoable: boolean;
}

/** Native owner of one chart's settings. Changes apply immediately and atomically; nothing is saved. */
export interface ChartSettingsApi {
  readonly version: 1;
  /** The active chart's settings, reported under `CHART_SETTINGS_TARGET`. */
  inspectChart(): InspectedChart;
  /** Same operation ID and intent returns the first receipt; a different intent is `operation_conflict`. */
  apply(operationId: string, intent: ChartSettingsIntent): ChartSettingsReceipt;
  destroy(): void;
}


export function chartSettingsCapability(): ChartSettingsCapability {
  const entry = CHART_CAPABILITIES.find((capability): capability is ChartSettingsCapability & typeof capability => capability.kind === 'chart');
  if (!entry) throw new ChartCommandError('unsupported');
  return entry;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ChartCommandError('invalid_input');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new ChartCommandError('invalid_input');
}

/** A non-empty patch of named chart fields. */
export function validateChartSettings(value: unknown): ChartSettings {
  const settings = record(value);
  if (!Object.keys(settings).length) throw new ChartCommandError('invalid_input');
  return validateCapabilityFields(settings, chartSettingsCapability().fields) as ChartSettings;
}

export function validateChartSettingsIntent(value: unknown): ChartSettingsIntent {
  assertBytes(value);
  const intent = record(value); exact(intent, ['settings']);
  return { settings: validateChartSettings(intent.settings) };
}

/** Every chart field, each a value of its declared kind (chart values are never unknown). */
export function validateChartSettingsValues(value: unknown): ChartSettings {
  const values = record(value);
  const fields = chartSettingsCapability().fields;
  if (Object.keys(values).length !== fields.length) throw new ChartCommandError('invalid_input');
  return validateCapabilityFields(values, fields) as ChartSettings;
}

/** A receipt for `intent` on `chartId`: the requested fields carry the requested values. */
export function validateChartSettingsReceipt(value: unknown, operationId: string, intent: ChartSettingsIntent, chartId?: string): ChartSettingsReceipt {
  assertBytes(value);
  const receipt = record(value); exact(receipt, ['version', 'operationId', 'chartId', 'state', 'saved', 'values', 'undoable']);
  if (receipt.version !== 1 || receipt.state !== 'applied' || receipt.saved !== false || typeof receipt.undoable !== 'boolean') throw new ChartCommandError('invalid_input');
  id(receipt.chartId);
  if (receipt.operationId !== operationId || (chartId !== undefined && receipt.chartId !== chartId)) throw new ChartCommandError('stale_binding');
  const values = validateChartSettingsValues(receipt.values);
  if (Object.entries(intent.settings).some(([field, requested]) => values[field] !== requested)) throw new ChartCommandError('invalid_input');
  return structuredClone(receipt) as unknown as ChartSettingsReceipt;
}
