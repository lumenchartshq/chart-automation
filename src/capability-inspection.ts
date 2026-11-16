import { assertBytes, ChartCommandError, sameBinding, validateBinding, type ChartBinding } from './contracts.js';
import { CHART_CAPABILITIES, CHART_CAPABILITY_SCHEMA_HASH } from './generated/capability-snapshot.js';
import { isBuiltInStudyIdForm, isStudyPaneId, STUDY_STYLE_FAMILIES } from './studies.js';
import { CHART_SETTINGS_TARGET } from './chart-settings.js';
import type { CapabilityField, DrawingCapability, EntityInspection, EntityInspectionRequest, ChartSettingsCapability, InspectedChart, InspectedDrawing, InspectedStudy, StudyCapability } from './capabilities.js';

const ENTITY_LIMIT = 20;
const RESULT_KEYS = ['version', 'schemaHash', 'binding', 'entities', 'missing'] as const;
const DRAWING_KEYS = ['kind', 'id', 'family', 'title', 'points', 'visible', 'locked', 'selected', 'editable', 'owner', 'values', 'explicit'] as const;
const CHART_KEYS = ['kind', 'id', 'values', 'chartTypes', 'editable'] as const;
const STUDY_KEYS = ['kind', 'id', 'studyId', 'title', 'paneId', 'paneIndex', 'scale', 'visible', 'editable', 'inputs', 'styles'] as const;

type Value = Record<string, unknown>;

function invalid(): never {
  throw new ChartCommandError('invalid_input');
}
function isRecord(value: unknown): value is Value {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** A plain object with no keys outside `keys`. */
function record(value: unknown, keys: readonly string[]): Value {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value;
}
function booleans(value: Value, keys: readonly string[]) {
  if (keys.some(key => typeof value[key] !== 'boolean')) invalid();
}
function capability<K extends 'drawing' | 'study'>(kind: K, id: unknown) {
  return CHART_CAPABILITIES.find(entry => entry.kind === kind && entry.id === id) as (K extends 'drawing' ? DrawingCapability : StudyCapability) | undefined;
}
/** A certified study descriptor, else a custom one the chart described (never for a built-in id form). */
function studyDescriptor(id: unknown, studies: readonly StudyCapability[]): StudyCapability | undefined {
  const certified = capability('study', id);
  if (certified || typeof id !== 'string' || isBuiltInStudyIdForm(id)) return certified;
  return studies.find(entry => entry.id === id);
}

export function validateEntityInspectionRequest(value: unknown): EntityInspectionRequest {
  assertBytes(value);
  const { entities } = record(value, ['entities']);
  if (!Array.isArray(entities) || entities.length < 1 || entities.length > ENTITY_LIMIT) throw new ChartCommandError('limit_exceeded');
  // IDs are unique across kinds so `missing` can stay a plain ID list.
  const seen = new Set<string>();
  for (const raw of entities) {
    const entity = record(raw, ['kind', 'id']);
    if (!['drawing', 'study', 'chart'].includes(entity.kind as string) || typeof entity.id !== 'string' || !entity.id.trim() || entity.id.length > 256 || seen.has(entity.id)) invalid();
    // A chart is addressed only as the active chart.
    if (entity.kind === 'chart' && entity.id !== CHART_SETTINGS_TARGET) invalid();
    seen.add(entity.id);
  }
  return structuredClone({ entities }) as EntityInspectionRequest;
}

/**
 * Validate the browser response against both the request and the allowlist.
 * `studies` adds the chart's custom study descriptors (`ChartStudyApi.studyCapabilities`).
 */
export function validateEntityInspection(value: unknown, request: EntityInspectionRequest, binding: ChartBinding, studies: readonly StudyCapability[] = []): EntityInspection {
  assertBytes(value);
  if (!isRecord(value)) invalid();
  if (value.schemaHash !== CHART_CAPABILITY_SCHEMA_HASH) throw new ChartCommandError('unsupported');
  const result = record(value, RESULT_KEYS);
  if (result.version !== 1 || !sameBinding(validateBinding(result.binding), binding) || !Array.isArray(result.entities) || !Array.isArray(result.missing)) invalid();
  const expected = new Map(request.entities.map(entity => [entity.id, entity.kind]));
  const seen = new Set<string>();
  for (const entity of result.entities as Value[]) {
    if (!isRecord(entity) || typeof entity.id !== 'string' || expected.get(entity.id) !== entity.kind || seen.has(entity.id)) invalid();
    seen.add(entity.id);
    if (entity.kind === 'drawing') validateDrawing(entity);
    else if (entity.kind === 'chart') validateChart(entity);
    else validateStudy(entity, studies);
  }
  for (const id of result.missing) {
    if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) invalid();
    seen.add(id);
  }
  if (seen.size !== expected.size) invalid();
  return structuredClone(result) as unknown as EntityInspection;
}

/**
 * Certified families report geometry and values. An uncertified drawing that
 * exists on the chart is reported as non-editable with no geometry or values,
 * so it is never mistaken for a missing target.
 */
function validateDrawing(value: Value): asserts value is Value & InspectedDrawing {
  const entity = record(value, DRAWING_KEYS);
  booleans(entity, ['visible', 'locked', 'selected', 'editable']);
  if (typeof entity.family !== 'string' || typeof entity.owner !== 'string' || (entity.title !== null && typeof entity.title !== 'string') || !Array.isArray(entity.points) || !Array.isArray(entity.explicit)) invalid();
  if (entity.editable && (entity.locked || entity.owner !== 'main-series')) invalid();
  const fields = capability('drawing', entity.family)?.fields;
  if (!fields && (entity.editable || entity.points.length || entity.explicit.length)) invalid();
  validateValues(entity.values, fields ?? []);
  const fieldIds = new Set((fields ?? []).map(field => field.id));
  if (entity.explicit.some((field: unknown) => typeof field !== 'string' || !fieldIds.has(field)) || new Set(entity.explicit).size !== entity.explicit.length) invalid();
  for (const raw of entity.points) {
    const point = record(raw, ['time', 'price']);
    if (point.time === undefined && point.price === undefined) invalid();
    if (point.time !== undefined && !Number.isSafeInteger(point.time)) invalid();
    if (point.price !== undefined && (typeof point.price !== 'number' || !Number.isFinite(point.price))) invalid();
  }
}

function validateStudy(value: Value, studies: readonly StudyCapability[]): asserts value is Value & InspectedStudy {
  const entity = record(value, STUDY_KEYS);
  booleans(entity, ['visible', 'editable']);
  if (entity.kind !== 'study' || typeof entity.studyId !== 'string' || typeof entity.title !== 'string' || typeof entity.paneId !== 'string' || typeof entity.scale !== 'string' || !Number.isSafeInteger(entity.paneIndex) || Number(entity.paneIndex) < 0) invalid();
  const descriptor = studyDescriptor(entity.studyId, studies);
  if (!isStudyPaneId(entity.paneId) || (entity.editable && !descriptor)) invalid();
  validateValues(entity.inputs, descriptor?.inputs ?? []);
  const styles = record(entity.styles, STUDY_STYLE_FAMILIES);
  for (const family of STUDY_STYLE_FAMILIES) {
    const groups = descriptor?.[family] ?? [];
    if (!groups.length) {
      if (styles[family] !== undefined) invalid();
      continue;
    }
    const values = record(styles[family], groups.map(group => group.id));
    if (Object.keys(values).length !== groups.length) invalid();
    for (const group of groups) validateValues(values[group.id], group.fields);
  }
}

/** A chart reports every certified field and the chart types it can show now. */
function validateChart(value: Value): asserts value is Value & InspectedChart {
  const entity = record(value, CHART_KEYS);
  booleans(entity, ['editable']);
  const descriptor: ChartSettingsCapability | undefined = CHART_CAPABILITIES.find(entry => entry.kind === 'chart');
  const chartType = descriptor?.fields.find(field => field.id === 'chartType');
  if (!descriptor || !chartType) invalid();
  validateValues(entity.values, descriptor.fields);
  const types = entity.chartTypes;
  if (!Array.isArray(types) || !types.length || new Set(types).size !== types.length || types.some((type: unknown) => typeof type !== 'string' || !chartType.choices?.includes(type))) invalid();
}

/** Exactly the allowlisted fields, each null or a value of its declared kind. */
function validateValues(values: unknown, fields: readonly CapabilityField[]) {
  const ids = fields.map(field => field.id);
  const entries = isRecord(values) ? values : invalid();
  if (Object.keys(entries).length !== ids.length || Object.keys(entries).some(key => !ids.includes(key))) invalid();
  for (const field of fields) {
    const value = entries[field.id];
    if (value !== null && !valueMatches(field, value)) invalid();
  }
}

function valueMatches(field: CapabilityField, value: unknown): boolean {
  switch (field.kind) {
    case 'color': return typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/.test(value);
    case 'text': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'enum': return typeof value === 'string' && field.choices?.includes(value) === true;
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isSafeInteger(value);
    case 'collection': return collectionMatches(field, value);
  }
}

/** Collection slots are 1-based, ascending and unique, each carrying exactly the item fields. */
function collectionMatches(field: CapabilityField, value: unknown): boolean {
  if (!Array.isArray(value) || value.length > (field.maxItems ?? 0)) return false;
  const item = field.item ?? [];
  let previous = 0;
  return value.every(entry => {
    if (!isRecord(entry) || !Number.isInteger(entry.slot) || Number(entry.slot) <= previous || Number(entry.slot) > (field.maxItems ?? 0)) return false;
    previous = Number(entry.slot);
    return Object.keys(entry).length === item.length + 1 && item.every(part => entry[part.id] === null || valueMatches(part, entry[part.id]));
  });
}
