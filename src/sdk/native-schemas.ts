import { GROUP_MEMBERS_LIMIT, GROUP_MEMBERS_MIN } from '../organization.js';
import { drawingTypesForCatalog, LIMITS, DRAWING_SETTINGS_LIMITS, REF_NAME } from '../contracts.js';
import { STUDY_IDS, STUDY_LIMITS, STUDY_STYLE_FAMILIES } from '../studies.js';
import { WORKSPACE_LAYOUTS, WORKSPACE_LIMITS } from '../workspace.js';
import { chartSettingsCapability } from '../chart-settings.js';
import { CHART_CAPABILITIES } from '../generated/capability-snapshot.js';
import { SYNC_KEYS } from '../sync.js';
import type { CapabilityField, StudyCapability } from '../capabilities.js';
import { field, objectSchema, type AnyField, type Fields } from './schema.js';

/**
 * Native mutation inputs, declared once with `field` builders: the declaration is both the JSON Schema a model
 * sees and a parser the command runs after its domain validator. Every accepted input therefore matches what the
 * model was told. Limits come from the same native constants the validators use; the validators stay
 * authoritative for rules a schema cannot express (references within a batch, per-type style
 * fields, byte budgets), and their error codes are what callers see.
 */

/** Native identifiers: 1 to 256 characters; the drawing owner accepts whitespace-only IDs. */
const nativeId = field.text(256, { minLength: 1 });
/** Study, workspace and pane identifiers: non-blank, up to 256 characters. */
const id = field.string(256);
const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

// Drawings
const point = field.object({ time: field.optional(field.integer()), price: field.optional(field.number()) }, { minProperties: 1 });
const style = field.object({
  color: field.optional(field.text(9, { pattern: COLOR })),
  lineWidth: field.optional(field.integer({ minimum: 1, maximum: 8 })),
  lineStyle: field.optional(field.oneOf(['solid', 'dashed', 'dotted'])),
  fillOpacity: field.optional(field.number({ minimum: 0, maximum: 1 })),
  text: field.optional(field.text(2000)),
});
/** Setting values depend on the drawing type; the owner validates them against its catalog. */
const drawingSettings = field.record(field.unknown(), { maxKeys: DRAWING_SETTINGS_LIMITS.fields, maxKeyLength: 256 });
const resetFields = field.array(nativeId, { minItems: 1, maxItems: DRAWING_SETTINGS_LIMITS.fields, uniqueItems: true });
const groupMembers = (minItems: number) => field.array(nativeId, { minItems, maxItems: GROUP_MEMBERS_LIMIT, uniqueItems: true });
const groupName = field.string(100);
const drawingGroupOperations = {
  'group.create': { name: groupName, ids: groupMembers(GROUP_MEMBERS_MIN) },
  'group.rename': { id: nativeId, name: groupName },
  'group.members': { id: nativeId, add: field.optional(groupMembers(1)), remove: field.optional(groupMembers(1)) },
  'group.visibility': { id: nativeId, visible: field.boolean() },
  'group.lock': { id: nativeId, locked: field.boolean(), confirmUserIntent: field.literal(true) },
  'group.remove': { id: nativeId },
};

export function drawingInput(catalogVersion?: 2, settingsVersion?: 1) {
  const extended = catalogVersion === 2;
  const settings = extended && settingsVersion === 1;
  const points = field.array(point, { minItems: 1, maxItems: extended ? 3 : 2 });
  const operation = field.union('action', {
    create: {
      type: field.oneOf(drawingTypesForCatalog(catalogVersion)),
      points,
      style: field.optional(style),
      ...(settings && {
        settings: field.optional(drawingSettings),
        ref: field.optional(field.string(32, { pattern: REF_NAME })),
      }),
    },
    update: {
      id: nativeId,
      points: field.optional(points),
      style: field.optional(style),
      ...(settings && { settings: field.optional(drawingSettings), reset: field.optional(resetFields) }),
    },
    delete: { id: nativeId },
    ...(extended && drawingGroupOperations),
  }, {
    // The action, the ID and at least one change. Individual drawing unlock is a user action.
    minProperties: { update: 3, 'group.members': 3 },
  });
  return objectSchema({ operations: field.array(operation, { minItems: 1, maxItems: LIMITS.operationsPerBatch }) });
}

// Studies
const certifiedStudies: readonly StudyCapability[] = CHART_CAPABILITIES.filter(entry => entry.kind === 'study');
const scale = field.oneOf(['main', 'own']);
const placement = field.object({ paneId: id, scale, position: field.optional(field.integer({ minimum: 0, maximum: STUDY_LIMITS.panes - 1 })) });
/**
 * The `studies.apply` input for the certified studies plus the chart's custom
 * study descriptors: add accepts their ids, and patches are bounded by the
 * largest declared study so a real study is never rejected by size.
 */
export function studyInputSchema(custom: readonly StudyCapability[] = []) {
  const certifiedIds = new Set<string>(STUDY_IDS);
  const extra = custom.filter(study => !certifiedIds.has(study.id));
  const studies = [...certifiedStudies, ...extra];
  const mostInStudies = (count: (study: StudyCapability) => number) => Math.max(1, ...studies.map(count));
  const styleGroups = (family: (typeof STUDY_STYLE_FAMILIES)[number]) => {
    const groups = mostInStudies(study => study[family]?.length ?? 0);
    const fields = mostInStudies(study => Math.max(0, ...(study[family] ?? []).map(group => group.fields.length)));
    return field.record(field.record(field.unknown(), { maxKeys: fields }), { maxKeys: groups });
  };
  const studyInputs = field.record(field.scalar(), { maxKeys: mostInStudies(study => study.inputs.length) });
  const studyStyles = field.object(Object.fromEntries(STUDY_STYLE_FAMILIES.map(family => [family, field.optional(styleGroups(family))])));
  const studyOperation = field.union('action', {
    add: { studyId: field.oneOf([...STUDY_IDS, ...extra.map(study => study.id)]), inputs: field.optional(studyInputs), styles: field.optional(studyStyles), placement: field.optional(placement) },
    update: { id, inputs: field.optional(studyInputs), styles: field.optional(studyStyles), placement: field.optional(placement) },
    remove: { id },
    add_comparison: { symbolId: id, scale, normalization: field.literal('raw') },
    remove_comparison: { id },
  }, { minProperties: { update: 3 } });
  return objectSchema({
    expectedRevision: field.integer({ minimum: 0 }),
    operations: field.array(studyOperation, { minItems: 1, maxItems: STUDY_LIMITS.operationsPerBatch }),
  });
}
export const studyInput = studyInputSchema();

// Chart settings: one optional entry per writable capability field, so a new field is advertised automatically.
function capabilityField(descriptor: CapabilityField): AnyField {
  const bounds = { ...(descriptor.min !== undefined ? { minimum: descriptor.min } : {}), ...(descriptor.max !== undefined ? { maximum: descriptor.max } : {}) };
  switch (descriptor.kind) {
    case 'boolean': return field.boolean();
    case 'enum': return field.oneOf(descriptor.choices ?? []);
    case 'color': return field.text(9, { pattern: COLOR });
    case 'text': return field.text(descriptor.maxLength ?? 2000);
    case 'number': return field.number(bounds);
    case 'integer': return field.integer(bounds);
    case 'collection': {
      const maxItems = descriptor.maxItems ?? 1;
      const item = field.object({ slot: field.integer({ minimum: 1, maximum: maxItems }), ...capabilityFields(descriptor.item ?? []) }, { minProperties: 2 });
      return field.object({ patch: field.array(item, { minItems: 1, maxItems }) });
    }
  }
}
function capabilityFields(descriptors: readonly CapabilityField[]): Fields {
  return Object.fromEntries(descriptors.filter(descriptor => descriptor.writable).map(descriptor => [descriptor.id, field.optional(capabilityField(descriptor))]));
}
export const settingsInput = objectSchema({ settings: field.object(capabilityFields(chartSettingsCapability().fields), { minProperties: 1 }) });

// Workspace
const selection = field.object({ symbol: id, symbolId: id, instrumentType: id, interval: id });
export const workspaceInput = objectSchema({
  version: field.literal(1),
  workspaceId: id,
  revision: field.integer({ minimum: 0 }),
  primaryChartId: id,
  activeChartId: id,
  layout: field.oneOf(WORKSPACE_LAYOUTS),
  slots: field.array(id, { minItems: 1, maxItems: WORKSPACE_LIMITS.charts, uniqueItems: true }),
  charts: field.array(field.object({ id, documentId: id, selection }), { minItems: 1, maxItems: WORKSPACE_LIMITS.charts }),
  sync: field.object(Object.fromEntries(SYNC_KEYS.map(key => [key, field.boolean()]))),
});
