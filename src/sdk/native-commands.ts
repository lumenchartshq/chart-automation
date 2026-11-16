import { chartCapabilityCatalog } from '../capability-catalog.js';
import type { CapabilityCatalogDetail, CapabilityCatalogPage, ChartCapability, InspectedChart, InspectedDrawing, InspectedStudy } from '../capabilities.js';
import type { DrawingGroupSummary } from '../organization.js';
import {
  COMMAND_STATES, LIMITS, validateBatch, validateOperations,
  type ChartBinding, type ChartContext, type ChartDrawingApi, type DrawingReceipt, type DrawingSummary, type PreparedDrawingBatch,
} from '../contracts.js';
import {
  STUDY_LIMITS, validateStudyBatch, validateStudyOperations, validateStudyReceipt,
  type ChartStudyApi, type ChartStudyContext, type PreparedStudyBatch, type StudyList,
} from '../studies.js';
import { validateChartSettingsIntent, validateChartSettingsReceipt, type ChartSettingsApi, type ChartSettingsReceipt } from '../chart-settings.js';
import { validateWorkspaceDocument, type ChartWorkspaceApi, type WorkspaceContext } from '../workspace.js';
import { ChartCommandError } from '../core-contracts/index.js';
import type { AutomationCommand, AutomationContext, AutomationSchema } from './contracts.js';
import type { ChartAutomation } from './chart-automation.js';
import type { NativeCommand, NativeCommandName } from './builtin-contracts.js';
import { liveNativeSchema, registerNativeCommand } from './native-registration.js';
import { drawingInput, settingsInput, studyInputSchema, workspaceInput } from './native-schemas.js';
import { pageSchema } from './page-schema.js';
import { emptySchema, field, nativeObject, objectSchema, strictRecord } from './schema.js';
import { disposeAll } from './dispose.js';

/** A native candidate prepared but not yet applied. */
export type NativePreparedChange =
  | { family: 'drawings'; prepared: PreparedDrawingBatch }
  | { family: 'studies'; prepared: PreparedStudyBatch };

export interface NativeCommandOwners {
  binding(): ChartBinding;
  drawings?: ChartDrawingApi;
  studies?: ChartStudyApi;
  settings?: ChartSettingsApi;
  workspace?: ChartWorkspaceApi;
  /**
   * Optional durable save for drawing and study changes, called after native
   * preparation and before commit while a mutation lease blocks manual edits.
   * Reject to abort: the candidate is discarded and nothing is applied. If the
   * request is cancelled after this resolves, the change is saved but not
   * applied, and the host reconciles it as it would a lost response.
   */
  persist?(change: NativePreparedChange, context: AutomationContext): Promise<void>;
}
type AnyNativeCommand = { [K in NativeCommandName]: NativeCommand<K> }[NativeCommandName];

/** Identity helper that types `execute` from the command map entry for `name`. */
const define = <K extends NativeCommandName>(command: NativeCommand<K>): NativeCommand<K> => command;

interface PreparingOwner<R> { commit(operationId: string): R; discard(operationId: string): void }

/** Prepare, commit, and always release the preparation, preserving native Undo. */
function commitPrepared<R>(owner: PreparingOwner<R>, operationId: string, prepare: () => void): R {
  try {
    prepare();
    return owner.commit(operationId);
  } finally {
    owner.discard(operationId);
  }
}

/** Prepare, persist under a mutation lease, then commit; without `persist` this is `commitPrepared`. */
async function commitPersisted<R, P>(
  owner: PreparingOwner<R> & { acquireMutationLease(operationId: string): () => void },
  context: AutomationContext,
  prepare: () => P,
  persist: ((prepared: P) => Promise<void>) | undefined,
): Promise<R> {
  if (!persist) return commitPrepared(owner, context.requestId, prepare);
  try {
    const prepared = prepare();
    const release = owner.acquireMutationLease(context.requestId);
    try {
      await persist(prepared);
      context.signal.throwIfAborted();
      return owner.commit(context.requestId);
    } finally {
      release();
    }
  } finally {
    owner.discard(context.requestId);
  }
}

const drawingReceiptSchema: AutomationSchema<DrawingReceipt> = {
  jsonSchema: { type: 'object' },
  parse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
    const receipt = value as Record<string, unknown>;
    const invalid = typeof receipt.operationId !== 'string'
      || !COMMAND_STATES.includes(receipt.state as DrawingReceipt['state'])
      || !Number.isSafeInteger(receipt.revision)
      || !Array.isArray(receipt.ids)
      || !receipt.ids.every(id => typeof id === 'string');
    if (invalid) throw new ChartCommandError('invalid_input');
    return value as DrawingReceipt;
  },
};

function capabilityCommands(owners: NativeCommandOwners): AnyNativeCommand[] {
  const kinds: ChartCapability['kind'][] = [];
  if (owners.drawings) kinds.push('drawing');
  if (owners.studies) kinds.push('study');
  if (owners.settings) kinds.push('chart');
  if (!kinds.length) return [];
  return [define({
    name: 'capabilities.query', version: 1, effect: 'read',
    description: 'Discover certified native fields and choices. Use id alone for detail, or kind/search/cursor for a page.',
    input: objectSchema({
      id: field.optional(field.string()),
      kind: field.optional(field.oneOf(kinds)),
      search: field.optional(field.text()),
      cursor: field.optional(field.text()),
    }),
    output: nativeObject<CapabilityCatalogPage | CapabilityCatalogDetail>(),
    execute: input => chartCapabilityCatalog(input, { kinds, studies: owners.studies?.studyCapabilities?.() ?? [] }),
  })];
}

type Persist = NativeCommandOwners['persist'];

function drawingCommands(owner: ChartDrawingApi, binding: () => ChartBinding, persist: Persist): AnyNativeCommand[] {
  const { catalogVersion, drawingSettingsVersion } = owner;
  const catalog = catalogVersion ? { catalogVersion } : {};
  return [
    define({
      name: 'drawings.context', version: 1, effect: 'read',
      description: 'Read native drawing context and supported families.',
      input: emptySchema,
      output: nativeObject<ChartContext>(),
      execute: () => owner.context({ ...catalog, ...(owner.inspectVersion ? { inspectVersion: owner.inspectVersion } : {}) }),
    }),
    define({
      name: 'drawings.list', version: 1, effect: 'read',
      description: 'Read a bounded page of native drawings.',
      input: pageSchema(LIMITS.summariesPerPage),
      output: nativeObject<{ drawings: DrawingSummary[]; total: number }>(),
      execute: input => owner.list(input, catalog),
    }),
    define({
      name: 'drawings.apply', version: 1, effect: 'mutation',
      description: 'Apply a native drawing batch with Undo; does not save to a remote service.',
      input: declared(drawingInput(catalogVersion, drawingSettingsVersion), value => {
        const input = strictRecord(value, ['operations']);
        return { operations: validateOperations(input.operations, catalogVersion, drawingSettingsVersion) };
      }),
      output: drawingReceiptSchema,
      execute(input, context) {
        const batch = validateBatch({
          version: 1,
          operationId: context.requestId,
          binding: binding(),
          operations: input.operations,
          catalogVersion,
          drawingSettingsVersion,
        });
        return commitPersisted(owner, context, () => owner.prepare(batch),
          persist && (prepared => persist({ family: 'drawings', prepared }, context)));
      },
    }),
    ...(owner.listGroups ? [define({
      name: 'drawings.groups', version: 1, effect: 'read',
      description: 'Read a bounded page of native drawing groups.',
      input: pageSchema(LIMITS.summariesPerPage),
      output: nativeObject<{ groups: DrawingGroupSummary[]; total: number }>(),
      execute: input => owner.listGroups!(input),
    })] : []),
    // Owners keep inspect methods when the host switches inspection off; they then reject.
    ...(owner.inspectDrawing && owner.inspectVersion === 1 ? [define({
      name: 'drawings.inspect', version: 1, effect: 'read',
      description: 'Read one drawing\'s current settings by exact ID; null when it is not on this chart.',
      input: entityIdSchema,
      output: nativeObject<{ drawing: InspectedDrawing | null }>(),
      execute: ({ id }) => ({ drawing: owner.inspectDrawing!(id, catalog) }),
    })] : []),
  ];
}

const entityIdSchema = objectSchema({ id: field.string(256) });

function studyCommands(owner: ChartStudyApi, binding: () => ChartBinding, persist: Persist): AnyNativeCommand[] {
  const expectedRevision = field.integer({ minimum: 0 });
  // The chart's custom studies (integrator custom JS indicators), when its owner describes them.
  const customStudies = () => owner.studyCapabilities?.() ?? [];
  // The input schema for the current custom studies, rebuilt only when they change.
  let schemaCache: { key: string; schema: ReturnType<typeof studyInputSchema> } | undefined;
  const currentStudyInput = () => {
    const custom = customStudies();
    const key = JSON.stringify(custom);
    if (schemaCache?.key !== key) schemaCache = { key, schema: studyInputSchema(custom) };
    return schemaCache.schema;
  };
  const commands: AnyNativeCommand[] = [
    define({
      name: 'studies.context', version: 1, effect: 'read',
      description: 'Read native study context and panes.',
      input: emptySchema,
      output: nativeObject<ChartStudyContext>(),
      execute: () => owner.context(),
    }),
    define({
      name: 'studies.list', version: 1, effect: 'read',
      description: 'Read a bounded page of native studies.',
      input: pageSchema(STUDY_LIMITS.summariesPerPage),
      output: nativeObject<StudyList>(),
      execute: input => owner.list(input),
    }),
  ];
  if (owner.inspectStudy && owner.inspectVersion === 1) commands.push(define({
    name: 'studies.inspect', version: 1, effect: 'read',
    description: 'Read one study\'s current inputs and styles by exact ID; null when it is not on this chart.',
    input: entityIdSchema,
    output: nativeObject<{ study: InspectedStudy | null }>(),
    execute: ({ id }) => ({ study: owner.inspectStudy!(id) }),
  }));
  if (owner.commandsEnabled === false) return commands;
  commands.push(define({
    name: 'studies.apply', version: 1, effect: 'mutation',
    description: 'Apply built-in study changes with native Undo.',
    // The schema follows the chart's custom studies: parsing uses the current list, and the advertised
    // schema is re-read with the capabilities, which advance their revision when it changed.
    input: liveNativeSchema(declared(currentStudyInput, value => {
      const input = strictRecord(value, ['operations', 'expectedRevision']);
      return { operations: validateStudyOperations(input.operations, customStudies()), expectedRevision: expectedRevision.parse(input.expectedRevision) };
    }), () => currentStudyInput().jsonSchema),
    output: { jsonSchema: { type: 'object' }, parse: value => validateStudyReceipt(value) },
    execute(input, context) {
      const batch = validateStudyBatch({
        version: 1,
        operationId: context.requestId,
        binding: binding(),
        chartId: owner.context().chartId,
        expectedRevision: input.expectedRevision,
        operations: input.operations,
      }, customStudies());
      return commitPersisted(owner, context, () => owner.prepare(batch),
        persist && (prepared => persist({ family: 'studies', prepared }, context)));
    },
  }));
  return commands;
}

function settingsCommands(owner: ChartSettingsApi): AnyNativeCommand[] {
  return [
    define({
      name: 'settings.inspect', version: 1, effect: 'read',
      description: 'Read native chart settings.',
      input: emptySchema,
      output: nativeObject<InspectedChart>(),
      execute: () => owner.inspectChart(),
    }),
    define({
      name: 'settings.apply', version: 1, effect: 'mutation',
      description: 'Change native chart and price-scale settings with Undo.',
      input: declared(settingsInput, validateChartSettingsIntent),
      output: nativeObject<ChartSettingsReceipt>(),
      execute: (input, context) => validateChartSettingsReceipt(owner.apply(context.requestId, input), context.requestId, input),
    }),
  ];
}

/**
 * A native input: the domain validator runs first and keeps its error codes and result, then the declared
 * schema checks the same value, so an accepted input always matches the JSON Schema the model was given.
 * A schema function is read on every call, for inputs whose accepted values follow chart state.
 */
function declared<T>(schema: AutomationSchema<unknown> | (() => AutomationSchema<unknown>), validate: (value: unknown) => T): AutomationSchema<T> {
  const current = typeof schema === 'function' ? schema : () => schema;
  return {
    jsonSchema: current().jsonSchema,
    parse(value) {
      const result = validate(value);
      current().parse(value);
      return result;
    },
  };
}

function workspaceCommands(owner: ChartWorkspaceApi): AnyNativeCommand[] {
  const parseDocument = (value: unknown) => validateWorkspaceDocument(value);
  return [
    define({
      name: 'workspace.context', version: 1, effect: 'read',
      description: 'Read native workspace context.',
      input: emptySchema,
      output: nativeObject<WorkspaceContext>(),
      execute: () => owner.context(),
    }),
    define({
      name: 'workspace.apply', version: 1, effect: 'mutation', targetChange: 'synchronous',
      description: 'Commit a native workspace document; remote persistence is host-owned.',
      input: declared(workspaceInput, parseDocument),
      // Owner output is trusted native data; its validator alone checks the committed document.
      output: { jsonSchema: workspaceInput.jsonSchema, parse: parseDocument },
      execute: (input, context) => commitPrepared(owner, context.requestId, () => owner.prepare(context.requestId, input)),
    }),
  ];
}

/** Every native command the supplied owners support. */
export function nativeCommands(owners: NativeCommandOwners): AnyNativeCommand[] {
  // Called as a method so host owners keep their receiver.
  const persist: Persist = owners.persist && ((change, context) => owners.persist!(change, context));
  return [
    ...capabilityCommands(owners),
    ...(owners.drawings ? drawingCommands(owners.drawings, owners.binding, persist) : []),
    ...(owners.studies ? studyCommands(owners.studies, owners.binding, persist) : []),
    ...(owners.settings ? settingsCommands(owners.settings) : []),
    ...(owners.workspace ? workspaceCommands(owners.workspace) : []),
  ];
}

/** Native commits only. Hosts needing remote durability keep their persistence coordinator. */
export function installNativeAutomationCommands(sdk: ChartAutomation, owners: NativeCommandOwners): () => void {
  const unregister: (() => void)[] = [];
  try {
    for (const command of nativeCommands(owners)) unregister.push(registerNativeCommand(sdk, command as AutomationCommand));
  } catch (error) {
    try { disposeAll(unregister.reverse()); } catch { /* Preserve the installation failure. */ }
    throw error;
  }
  return () => disposeAll(unregister.splice(0).reverse());
}
