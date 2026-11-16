import { ChartCommandError } from './contracts.js';
import type { CapabilityField } from './capabilities.js';

/** Validate a patch of named fields against certified capability descriptors. */
export function validateCapabilityFields(value: unknown, fields: readonly CapabilityField[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  const settings = value as Record<string, unknown>;
  const descriptors = new Map(fields.filter(field => field.writable).map(field => [field.id, field]));
  for (const [id, setting] of Object.entries(settings)) {
    const field = descriptors.get(id);
    if (!field) throw new ChartCommandError('unsupported');
    validateValue(setting, field);
  }
  return structuredClone(settings);
}

function validateValue(value: unknown, field: CapabilityField): void {
  if (field.kind === 'collection') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
    const collection = value as Record<string, unknown>;
    if (Object.keys(collection).some(key => key !== 'patch') || !Array.isArray(collection.patch) || !collection.patch.length || field.maxItems === undefined || collection.patch.length > field.maxItems) throw new ChartCommandError('invalid_input');
    const slots = new Set<number>();
    for (const item of collection.patch) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ChartCommandError('invalid_input');
      const { slot, ...patch } = item as Record<string, unknown>;
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > field.maxItems || slots.has(slot) || !Object.keys(patch).length) throw new ChartCommandError('invalid_input');
      slots.add(slot);
      validateCapabilityFields(patch, field.item ?? []);
    }
    return;
  }
  if (field.kind === 'boolean' && typeof value === 'boolean') return;
  if (field.kind === 'color' && typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return;
  if (field.kind === 'text' && typeof value === 'string' && value.length <= (field.maxLength ?? 2000)) return;
  if (field.kind === 'enum' && typeof value === 'string' && field.choices?.includes(value)) return;
  if ((field.kind === 'number' || field.kind === 'integer') && typeof value === 'number' && Number.isFinite(value) && (field.kind !== 'integer' || Number.isInteger(value)) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max)) return;
  throw new ChartCommandError('invalid_input');
}

/** Reset removes an explicit field; it cannot also be assigned in the same patch. */
export function validateCapabilityReset(value: unknown, fields: readonly CapabilityField[], settings: Record<string, unknown> = {}): string[] {
  if (!Array.isArray(value) || !value.length) throw new ChartCommandError('invalid_input');
  const writable = new Set(fields.filter(field => field.writable).map(field => field.id));
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || !id || seen.has(id) || Object.hasOwn(settings, id)) throw new ChartCommandError('invalid_input');
    if (!writable.has(id)) throw new ChartCommandError('unsupported');
    seen.add(id);
  }
  return [...seen];
}
