import { ChartCommandError, type DrawingOperation, type DrawingType } from './contracts.js';
import type { CapabilityField, ChartCapability } from './capabilities.js';
import { CHART_CAPABILITIES } from './generated/capability-snapshot.js';
import { validateCapabilityReset, validateCapabilityFields } from './capability-fields.js';

/** Certified fields of a drawing family from the build-time snapshot. */
export function drawingCapabilityFields(type: string): readonly CapabilityField[] | undefined {
  const entry = (CHART_CAPABILITIES as readonly ChartCapability[]).find(item => item.kind === 'drawing' && item.id === type);
  return entry?.kind === 'drawing' ? entry.fields : undefined;
}

/**
 * Descriptor validation for one operation whose family is known. Creation knows
 * it from `type`; an update learns it from the target, so the browser repeats
 * this check as the final authority.
 */
export function validateDrawingOperationSettings(
  type: DrawingType,
  operation: Extract<DrawingOperation, { action: 'create' | 'update' }>,
): void {
  const fields = drawingCapabilityFields(type);
  if (!fields) throw new ChartCommandError('unsupported');
  if (operation.settings !== undefined) validateCapabilityFields(operation.settings, fields);
  if (operation.action === 'update' && operation.reset !== undefined) {
    validateCapabilityReset(operation.reset, fields, { ...operation.style, ...operation.settings });
  }
}

/** Worker-side check of everything decidable without the chart's current drawings. */
export function validateDrawingSettingsOperations(operations: readonly DrawingOperation[]): void {
  for (const operation of operations) {
    if (operation.action === 'create' && operation.settings !== undefined) {
      validateDrawingOperationSettings(operation.type, operation);
    }
  }
}
