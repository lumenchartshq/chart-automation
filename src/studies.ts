import { CHART_DOCUMENT_LIMITS } from "./core-contracts/index.js";
import { sameStudyBinding, validateStudyDocument, CHART_MAIN_SOURCE, CHART_SCRIPT_SOURCE, STUDY_DOCUMENT_PAYLOAD_VERSION } from './core-contracts/index.js';
export { sameStudyBinding, validateStudyDocument, CHART_MAIN_SOURCE, CHART_SCRIPT_SOURCE, STUDY_DOCUMENT_PAYLOAD_VERSION } from './core-contracts/index.js';
import type { ChartPane, ChartDocumentPayload, StudyDocument } from './core-contracts/index.js';
export type { ChartPane, ChartDocumentPayload, StudyDocument } from './core-contracts/index.js';
import { ChartCommandError, assertBytes, validateBinding, sameBinding, type ChartBinding } from './contracts.js';
import { validateComparisonRecord, type ComparisonSummary } from './workspace.js';
import { CHART_CAPABILITIES, CHART_STUDY_IDS } from './generated/capability-snapshot.js';
import type { StudyCapability } from './capabilities.js';
import { validateCapabilityFields } from './capability-fields.js';

export const CHART_STUDY_VERSION = 2 as const;
/** Generated with the capability snapshot; the chart package policy is the only list to edit. */
export const STUDY_IDS = CHART_STUDY_IDS;
export type BuiltInStudyId = typeof STUDY_IDS[number];
/**
 * A study type: a certified built-in, or a custom study the chart describes at
 * runtime through `ChartStudyApi.studyCapabilities` (an integrator's custom JS
 * indicator, whose id is never a built-in id).
 */
export type StudyTypeId = BuiltInStudyId | (string & {});
/** Whether an id is a certified built-in study. */
export function isCertifiedStudyId(id: unknown): id is BuiltInStudyId {
  return STUDY_IDS.includes(id as BuiltInStudyId);
}
/** Whether an id has the built-in study id form; custom study ids are integrator-chosen. */
export function isBuiltInStudyIdForm(id: string): boolean {
  return /@chart-studies-\d+$/.test(id);
}
/** The certified descriptor for `id`, else the chart's runtime descriptor from `studies`. */
function studyCapability(id: unknown, studies: readonly StudyCapability[] = []): StudyCapability | undefined {
  const certified = CHART_CAPABILITIES.find((entry): entry is StudyCapability & typeof entry => entry.kind === 'study' && entry.id === id);
  if (certified || typeof id !== 'string' || isBuiltInStudyIdForm(id)) return certified;
  return studies.find(entry => entry.kind === 'study' && entry.id === id);
}
export const STUDY_LIMITS = { studies: 16, comparisons: CHART_DOCUMENT_LIMITS.comparisons, panes: 8, savedStudies: CHART_DOCUMENT_LIMITS.savedStudies, savedPanes: CHART_DOCUMENT_LIMITS.savedPanes, summariesPerPage: 20, summariesPerTurn: 100, operationsPerBatch: 10, mutationsPerTurn: 30 } as const;
export type StudyInputs = Record<string, string | number | boolean>;
export const STUDY_STYLE_FAMILIES = ['plots', 'bands', 'fills'] as const;
export type StudyStyleFamily = typeof STUDY_STYLE_FAMILIES[number];
export type StudyStyles = { [family in StudyStyleFamily]?: Record<string, Record<string, unknown>> };
/** Each named style group in a patch, in family order. */
export function studyStyleGroups(styles: StudyStyles): { family: StudyStyleFamily; id: string; patch: Record<string, unknown> }[] {
  return STUDY_STYLE_FAMILIES.flatMap(family => Object.entries(styles[family] ?? {}).map(([id, patch]) => ({ family, id, patch })));
}
import { STUDY_MAIN_PANE_ID, STUDY_NEW_PANE_ID, newStudyPaneId, isDetachedStudyPaneId, isStudyPaneId } from "./core-contracts/index.js";
export { STUDY_MAIN_PANE_ID, STUDY_NEW_PANE_ID, newStudyPaneId, isDetachedStudyPaneId, isStudyPaneId } from "./core-contracts/index.js";
export interface StudyPlacement { paneId: string; scale: 'main' | 'own'; position?: number }
export type StudyOperation =
  | { action: 'add'; studyId: StudyTypeId; inputs?: StudyInputs; styles?: StudyStyles; placement?: StudyPlacement }
  | { action: 'update'; id: string; inputs?: StudyInputs; styles?: StudyStyles; placement?: StudyPlacement }
  | { action: 'remove'; id: string }
  | { action: 'add_comparison'; symbolId: string; scale: 'main' | 'own'; normalization: 'raw' }
  | { action: 'remove_comparison'; id: string };
/** Ids an applied receipt reports a calculation status for: every added or updated study. */
export function studyCalculatedIds(operationId: string, operations: readonly StudyOperation[]): string[] {
  const ids = studyOperationIds(operationId, operations);
  return [...new Set(operations.flatMap((op, index) => op.action === 'add' || op.action === 'update' ? [ids[index]!] : []))];
}
/** Ids a batch creates or targets, in operation order. */
export function studyOperationIds(operationId: string, operations: readonly StudyOperation[]): string[] {
  return operations.map((op, index) => {
    if (op.action === 'add') return `ai-study-${operationId}-${index}`;
    if (op.action === 'add_comparison') return `ai-compare-${operationId}-${index}`;
    return op.id;
  });
}
export interface StudyBatch {
  version: 1;
  operationId: string;
  binding: ChartBinding;
  chartId: string;
  expectedRevision: number;
  operations: StudyOperation[];
}
/** A pane lists the sources it holds, in draw order; the pane list order is the vertical order. */

/**
 * The chart document: built-in studies, comparisons and the pane layout. `main`
 * and `script` are reserved source ids for the main series and the Lumen Script study's
 * placement; the Lumen Script study itself is never saved here.
 */




export interface StudyReceipt { version: 1; operationId: string; chartId: string; documentId: string; state: 'committed' | 'applied'; revision: number; ids: string[]; calculation?: Record<string, 'pending' | 'ready' | 'error'> }
export interface PreparedStudyBatch { operationId: string; chartId: string; binding: ChartBinding; document: StudyDocument; ids: string[] }
/** `paneId` is the placement target; `paneIndex` is display order only. */
export interface StudySummary { id: string; studyId: string; title: string; editable: boolean; locked: boolean; paneId: string; paneIndex: number; inputs: Record<string, unknown> }
export interface ChartStudyContext { version: 1; chartId: string; documentId: string; revision: number; panes: { id: string; position: number }[]; limits: { studies: number; panes: number }; count: number; paneCount: number; comparisons: ComparisonSummary[] }
export interface ChartStudyOptions { chartId: string; documentId: string; revision: number; limits?: { studies?: number; panes?: number } }
export interface ChartStudyApi {
  readonly version: 2;
  readonly inspectVersion?: 1;
  /** False when the host switched study command mutations off; save and restore still work. */
  readonly commandsEnabled?: boolean;
  inspectStudy?(id: string): import('./capabilities.js').InspectedStudy | null;
  /**
   * Custom studies this chart describes at runtime (an integrator's custom JS
   * indicators), in the certified descriptor format; certified built-ins are
   * not repeated. Absent or empty when the chart has none or automation keeps
   * them read-only. Commands, the catalog and validation accept these ids.
   */
  studyCapabilities?(): readonly StudyCapability[];
  context(): ChartStudyContext;
  list(input: { offset: number; limit: number }): { studies: StudySummary[]; total: number; revision: number };
  exportDocument(): StudyDocument;
  restoreDocument(document: StudyDocument): void;
  updatePersistenceRevision(revision: number): void;
  prepare(batch: StudyBatch): PreparedStudyBatch;
  acquireMutationLease(operationId: string): () => void;
  commit(operationId: string): StudyReceipt;
  discard(operationId: string): void;
  invalidate(): void;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}
/** Drawing persistence revisions are independent of study document CAS. */



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
/** A style patch is an object of families, each an object of group patches. */
function styleShape(value: unknown): StudyStyles {
  const styles = record(value); exact(styles, STUDY_STYLE_FAMILIES);
  for (const family of STUDY_STYLE_FAMILIES) {
    if (styles[family] === undefined) continue;
    for (const patch of Object.values(record(styles[family]))) record(patch);
  }
  return styles as StudyStyles;
}
function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ChartCommandError('invalid_input');
}
/** Validate an input patch against the certified descriptor, or the chart's custom study descriptors in `studies`. */
export function validateStudyInputs(value: unknown, studyId: StudyTypeId, studies: readonly StudyCapability[] = []): StudyInputs {
  const input = record(value);
  if (!Object.keys(input).length) throw new ChartCommandError('invalid_input');
  const capability: StudyCapability | undefined = studyCapability(studyId, studies);
  if (!capability) throw new ChartCommandError('unsupported');
  return validateCapabilityFields(input, capability.inputs) as StudyInputs;
}

/** Validate only named plot, band and fill fields; no native property paths are accepted. */
export function validateStudyStyles(value: unknown, studyId: StudyTypeId, studies: readonly StudyCapability[] = []): StudyStyles {
  const input = styleShape(value);
  const capability: StudyCapability | undefined = studyCapability(studyId, studies);
  if (!capability) throw new ChartCommandError('unsupported');
  let count = 0;
  for (const { family, id, patch } of studyStyleGroups(styleShape(input))) {
    const entry = capability[family]?.find(entry => entry.id === id);
    if (!entry) throw new ChartCommandError('unsupported');
    count += Object.keys(validateCapabilityFields(patch, entry.fields)).length;
  }
  if (!count) throw new ChartCommandError('invalid_input');
  return structuredClone(input) as StudyStyles;
}

export function validateStudyPlacement(value: unknown): StudyPlacement {
  const placement = record(value); exact(placement, ['paneId', 'scale', 'position']);
  id(placement.paneId);
  if (placement.paneId !== STUDY_NEW_PANE_ID && !isStudyPaneId(placement.paneId)) throw new ChartCommandError('invalid_input');
  if (placement.scale !== 'main' && placement.scale !== 'own') throw new ChartCommandError('unsupported');
  if (placement.scale === 'main' && placement.paneId !== STUDY_MAIN_PANE_ID) throw new ChartCommandError('invalid_input');
  if (placement.position !== undefined && (!Number.isSafeInteger(placement.position) || Number(placement.position) < 0 || Number(placement.position) >= STUDY_LIMITS.panes)) throw new ChartCommandError('invalid_input');
  return structuredClone(placement) as unknown as StudyPlacement;
}
/**
 * An update's inputs and styles against its target's study type. The batch
 * shape does not know the target type; the tools check this once discovery has
 * resolved it, and the native owner checks it against the live record.
 */
export function validateStudyTargetPatch(operation: Pick<Extract<StudyOperation, { action: 'update' }>, 'inputs' | 'styles'>, studyId: StudyTypeId, studies: readonly StudyCapability[] = []): void {
  if (operation.inputs !== undefined) validateStudyInputs(operation.inputs, studyId, studies);
  if (operation.styles !== undefined) validateStudyStyles(operation.styles, studyId, studies);
}
/**
 * Batch shape: adds are checked against their study, updates by shape until the
 * target is resolved. `studies` adds the chart's custom study descriptors.
 */
export function validateStudyOperations(value: unknown, studies: readonly StudyCapability[] = []): StudyOperation[] {
  assertBytes(value);
  if (!Array.isArray(value) || !value.length || value.length > STUDY_LIMITS.operationsPerBatch) throw new ChartCommandError('limit_exceeded');
  return value.map(raw => {
    const op = record(raw);
    if (op.action === 'add') {
      exact(op, ['action', 'studyId', 'inputs', 'styles', 'placement']);
      const capability = studyCapability(op.studyId, studies);
      if (!capability) throw new ChartCommandError('unsupported');
      if (op.inputs !== undefined) validateStudyInputs(op.inputs, capability.id, [capability]);
      if (op.styles !== undefined) validateStudyStyles(op.styles, capability.id, [capability]);
      if (op.placement !== undefined) validateStudyPlacement(op.placement);
    } else if (op.action === 'update') {
      exact(op, ['action', 'id', 'inputs', 'styles', 'placement']); id(op.id);
      if (op.inputs === undefined && op.styles === undefined && op.placement === undefined) throw new ChartCommandError('invalid_input');
      if (op.placement !== undefined) validateStudyPlacement(op.placement);
      if (op.inputs !== undefined && !Object.keys(record(op.inputs)).length) throw new ChartCommandError('invalid_input');
      if (op.styles !== undefined && !studyStyleGroups(styleShape(op.styles)).some(group => Object.keys(group.patch).length)) throw new ChartCommandError('invalid_input');
    } else if (op.action === 'remove' || op.action === 'remove_comparison') {
      exact(op, ['action', 'id']); id(op.id);
    } else if (op.action === 'add_comparison') {
      exact(op, ['action', 'symbolId', 'scale', 'normalization']); id(op.symbolId);
      if (!['main', 'own'].includes(String(op.scale)) || op.normalization !== 'raw') throw new ChartCommandError('unsupported');
    } else throw new ChartCommandError('unsupported');
    return structuredClone(op) as StudyOperation;
  });
}
export function validateStudyBatch(value: unknown, studies: readonly StudyCapability[] = []): StudyBatch {
  assertBytes(value); const batch = record(value);
  exact(batch, ['version', 'operationId', 'binding', 'chartId', 'expectedRevision', 'operations']);
  if (batch.version !== 1) throw new ChartCommandError('unsupported');
  id(batch.operationId); id(batch.chartId); revision(batch.expectedRevision); validateBinding(batch.binding); validateStudyOperations(batch.operations, studies);
  return structuredClone(batch) as unknown as StudyBatch;
}
export function validateStudyRead(value: unknown): { offset: number; limit: number } {
  const input = record(value); exact(input, ['offset', 'limit']); revision(input.offset);
  if (!Number.isSafeInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > STUDY_LIMITS.summariesPerPage) throw new ChartCommandError('limit_exceeded');
  return { offset: Number(input.offset), limit: Number(input.limit) };
}

/** The chart document payload version this build reads and writes. */

/**
 * A saved study document in a format this build has retired (an older payload
 * version). Only these may be cleared automatically: a newer or malformed
 * document may still be readable by another build, so it is never deleted.
 */
export function isRetiredStudyDocument(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as { version?: unknown; payload?: { version?: unknown } | null };
  const version = document.payload?.version;
  return document.version === 1 && Number.isSafeInteger(version) && Number(version) >= 1 && Number(version) < STUDY_DOCUMENT_PAYLOAD_VERSION;
}
/** A chart with the main series and the Lumen Script placement directly below it. */
export function initialChartDocumentPayload(): ChartDocumentPayload {
  return { version: 3, panes: [{ id: STUDY_MAIN_PANE_ID, height: 0, collapsed: false, sources: [CHART_MAIN_SOURCE] }, { id: newStudyPaneId(), height: 0, collapsed: false, sources: [CHART_SCRIPT_SOURCE] }], studies: [], comparisons: [], priceScales: {} };
}
/** A receipt's shape; with `operations`, an applied receipt reports exactly their calculated ids. */
export function validateStudyReceipt(value: unknown, operations?: readonly StudyOperation[]): StudyReceipt {
  assertBytes(value); const receipt = record(value);
  exact(receipt, ['version', 'operationId', 'chartId', 'documentId', 'state', 'revision', 'ids', 'calculation']);
  if (receipt.version !== 1 || !['committed', 'applied'].includes(String(receipt.state))) throw new ChartCommandError('unsupported');
  id(receipt.operationId); id(receipt.chartId); id(receipt.documentId); revision(receipt.revision);
  if (!Array.isArray(receipt.ids) || receipt.ids.length > STUDY_LIMITS.operationsPerBatch) throw new ChartCommandError('limit_exceeded');
  receipt.ids.forEach(id);
  if (receipt.calculation !== undefined) {
    if (receipt.state !== 'applied') throw new ChartCommandError('invalid_input');
    const calculation = record(receipt.calculation);
    if (Object.entries(calculation).some(([key, value]) => !(receipt.ids as unknown[]).includes(key) || !['pending', 'ready', 'error'].includes(String(value)))) throw new ChartCommandError('invalid_input');
  }
  if (operations && receipt.state === 'applied') {
    const expected = studyCalculatedIds(String(receipt.operationId), operations).sort();
    if (JSON.stringify(Object.keys(record(receipt.calculation ?? {})).sort()) !== JSON.stringify(expected)) throw new ChartCommandError('invalid_input');
  }
  return structuredClone(receipt) as unknown as StudyReceipt;
}

export interface StudyApplyIntent { chartId: string; expectedRevision: number; operations: StudyOperation[] }
export function validateStudyApplyIntent(value: unknown): StudyApplyIntent {
  const intent = record(value); exact(intent, ['chartId', 'expectedRevision', 'operations']);
  id(intent.chartId); revision(intent.expectedRevision);
  return { chartId: intent.chartId, expectedRevision: Number(intent.expectedRevision), operations: validateStudyOperations(intent.operations) };
}
export function validatePreparedStudyBatch(value: unknown, batch: StudyBatch): PreparedStudyBatch {
  const prepared = record(value); exact(prepared, ['operationId', 'chartId', 'binding', 'document', 'ids']);
  validateBinding(prepared.binding);
  const document = validateStudyDocument(prepared.document);
  if (prepared.operationId !== batch.operationId || prepared.chartId !== batch.chartId || document.chartId !== batch.chartId || document.documentId !== batch.binding.documentId || document.revision !== batch.expectedRevision + 1 || !sameStudyBinding(prepared.binding as ChartBinding, batch.binding)) throw new ChartCommandError('stale_binding');
  const ids = studyOperationIds(batch.operationId, batch.operations);
  if (JSON.stringify(prepared.ids) !== JSON.stringify(ids)) throw new ChartCommandError('invalid_input');
  return structuredClone(prepared) as unknown as PreparedStudyBatch;
}
export function validateStudyContext(value: unknown): ChartStudyContext {
  assertBytes(value); const context = record(value);
  exact(context, ['version', 'chartId', 'documentId', 'revision', 'panes', 'limits', 'count', 'paneCount', 'comparisons']);
  if (context.version !== 1) throw new ChartCommandError('unsupported');
  id(context.chartId); id(context.documentId); revision(context.revision); revision(context.count); revision(context.paneCount);
  const limits = record(context.limits); exact(limits, ['studies', 'panes']);
  if (!Number.isSafeInteger(limits.studies) || Number(limits.studies) < 1 || Number(limits.studies) > STUDY_LIMITS.studies || !Number.isSafeInteger(limits.panes) || Number(limits.panes) < 1 || Number(limits.panes) > STUDY_LIMITS.panes) throw new ChartCommandError('invalid_input');
  if (!Array.isArray(context.panes) || !context.panes.length || context.panes.length > STUDY_LIMITS.savedPanes) throw new ChartCommandError('invalid_input');
  const paneIds = new Set<string>();
  for (const [position, raw] of context.panes.entries()) {
    const pane = record(raw); exact(pane, ['id', 'position']);
    if (!isStudyPaneId(pane.id) || paneIds.has(pane.id) || pane.position !== position) throw new ChartCommandError('invalid_input');
    paneIds.add(pane.id);
  }
  if (!paneIds.has(STUDY_MAIN_PANE_ID)) throw new ChartCommandError('invalid_input');
  if (!Array.isArray(context.comparisons) || context.comparisons.length > STUDY_LIMITS.comparisons) throw new ChartCommandError('invalid_input');
  for (const raw of context.comparisons) {
    const comparison = record(raw); exact(comparison, ['id', 'symbol', 'scale', 'normalization', 'editable']);
    id(comparison.id); id(comparison.symbol); id(comparison.scale);
    if (!['raw', 'percentage'].includes(String(comparison.normalization)) || typeof comparison.editable !== 'boolean') throw new ChartCommandError('invalid_input');
  }
  return structuredClone(context) as unknown as ChartStudyContext;
}
export interface StudyList { studies: StudySummary[]; total: number; revision: number }
/**
 * A list page. Rows with a built-in id are editable only when certified. Rows
 * with another id are the chart's custom studies; with `studies`, an editable
 * one must be described there.
 */
export function validateStudyList(value: unknown, input: { offset: number; limit: number }, studies?: readonly StudyCapability[]): StudyList {
  assertBytes(value); const result = record(value); exact(result, ['studies', 'total', 'revision']);
  revision(result.revision); revision(result.total);
  if (!Array.isArray(result.studies) || result.studies.length > input.limit || result.studies.length > Math.max(0, Number(result.total) - input.offset)) throw new ChartCommandError('invalid_input');
  const ids = new Set<string>();
  for (const raw of result.studies) {
    const study = record(raw); exact(study, ['id', 'studyId', 'title', 'editable', 'locked', 'paneId', 'paneIndex', 'inputs']);
    id(study.id); id(study.studyId); id(study.title); revision(study.paneIndex); record(study.inputs);
    if (!isStudyPaneId(study.paneId)) throw new ChartCommandError('invalid_input');
    const builtIn = isBuiltInStudyIdForm(study.studyId);
    const describable = builtIn ? isCertifiedStudyId(study.studyId) : !studies || studies.some(entry => entry.id === study.studyId);
    if (ids.has(study.id) || typeof study.editable !== 'boolean' || typeof study.locked !== 'boolean' || (study.editable && !describable)) throw new ChartCommandError('invalid_input');
    ids.add(study.id);
  }
  return structuredClone(result) as unknown as StudyList;
}
