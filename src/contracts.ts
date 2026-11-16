import { assertBytes, validateDocument, sameBinding } from './core-contracts/index.js';
export { assertBytes, validateDocument, sameBinding } from './core-contracts/index.js';
import type { ChartBinding, DrawingDocument, ChartBar } from './core-contracts/index.js';
export type { ChartBinding, DrawingDocument, ChartBar } from './core-contracts/index.js';
/** Provider-neutral drawing protocol. All times are UTC epoch milliseconds. */
import {
  GROUP_ACTIONS,
  GROUP_MEMBERS_LIMIT,
  GROUP_MEMBERS_MIN,
  type DrawingGroupOperation,
  type DrawingGroupSummary,
} from "./organization.js";
export const DRAWING_TYPES = [
  "horizontal_line",
  "vertical_line",
  "trend_line",
  "ray",
  "rectangle",
  "text",
] as const;
export const DRAWING_CATALOG_TYPES = [
  ...DRAWING_TYPES,
  "fib_retracement",
  "parallel_channel",
  "arrow",
  "ellipse",
] as const;
export type DrawingType = (typeof DRAWING_CATALOG_TYPES)[number];
export function drawingTypesForCatalog(version?: 2): readonly DrawingType[] {
  return version === 2 ? DRAWING_CATALOG_TYPES : DRAWING_TYPES;
}
export function drawingStyleFields(
  type: DrawingType,
): readonly (keyof DrawingStyle)[] {
  if (type === "text") return ["color", "text"];
  if (type === "ellipse") return ["color", "lineWidth", "fillOpacity", "text"];
  if (type === "fib_retracement")
    return ["color", "lineWidth", "lineStyle", "fillOpacity"];
  if (type === "parallel_channel")
    return ["color", "lineWidth", "lineStyle", "fillOpacity"];
  const fields: (keyof DrawingStyle)[] = ["color", "lineWidth", "lineStyle"];
  if (type === "rectangle") fields.push("fillOpacity", "text");
  if (type === "trend_line" || type === "arrow") fields.push("text");
  return fields;
}
export const LIMITS = {
  barsPerRead: 2000,
  barsPerTurn: 10000,
  summariesPerPage: 100,
  summariesPerTurn: 500,
  operationsPerBatch: 25,
  mutationsPerTurn: 100,
  messageBytes: 256 * 1024,
  documentBytes: 2 * 1024 * 1024,
  deadlineMs: 30000,
} as const;
import { ChartCommandError, type ChartErrorCode } from "./core-contracts/index.js";
export { ChartCommandError, chartCommandErrorCode, CHART_ERROR_CODES, type ChartErrorCode } from "./core-contracts/index.js";

export interface DrawingPoint {
  time?: number;
  price?: number;
}
export interface DrawingStyle {
  color?: string;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  fillOpacity?: number;
  text?: string;
}
/** Settings keyed by capability field IDs; values are validated against the family's descriptors. */
export type DrawingSettings = Record<string, unknown>;
export const DRAWING_SETTINGS_LIMITS = { fields: 64 } as const;
const REF_PREFIX = "ref:";
/** Name of a drawing created earlier in the same batch, referenced as `ref:<name>`. */
export const REF_NAME = /^[a-z][a-z0-9_]{0,31}$/;
export type DrawingOperation =
  | DrawingGroupOperation
  | {
      action: "create";
      type: DrawingType;
      points: DrawingPoint[];
      style?: DrawingStyle;
      settings?: DrawingSettings;
      /** Local name for grouping this new drawing later in the batch as `ref:<name>`. */
      ref?: string;
    }
  | {
      action: "update";
      id: string;
      points?: DrawingPoint[];
      style?: DrawingStyle;
      settings?: DrawingSettings;
      /** Field IDs returned to their native defaults. */
      reset?: string[];
      unlock?: boolean;
    }
  | { action: "delete"; id: string; unlock?: boolean };
export interface DrawingBatch {
  version: 1;
  operationId: string;
  binding: ChartBinding;
  operations: DrawingOperation[];
  catalogVersion?: 2;
  drawingSettingsVersion?: 1;
}
/** Serialization stays opaque and chart-owned; hosts must not reinterpret geometry. */

export const COMMAND_STATES = [
  "pending",
  "prepared",
  "committed",
  "applied",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type CommandState = (typeof COMMAND_STATES)[number];
export interface DrawingReceipt {
  operationId: string;
  state: CommandState;
  revision: number;
  ids: string[];
  groupIds?: string[];
  code?: ChartErrorCode;
}
export interface DrawingSummary {
  id: string;
  type: string;
  points: DrawingPoint[];
  locked: boolean;
  selected: boolean;
  text?: string;
  editable: boolean;
  title?: string | null;
  visible?: boolean;
  color?: string | null;
}
export interface ChartContext {
  version: 1;
  binding: ChartBinding;
  types: readonly DrawingType[];
  visibleRange: { from: number; to: number } | null;
  selectedIds: string[];
  snapshotId: string;
  coverage?: { from: number | null; to: number | null };
  timezone?: string;
  capabilitySchemaHash?: string;
  drawingCatalog?: {
    version: 2;
    families: readonly {
      type: DrawingType;
      pointCount: number;
      anchor: "time" | "price" | "time_price";
      styleFields: readonly (keyof DrawingStyle)[];
    }[];
    groupActions: typeof GROUP_ACTIONS;
    groupMembersLimit: number;
  };
}
export interface PreparedDrawingBatch {
  operationId: string;
  binding: ChartBinding;
  document: DrawingDocument;
  ids: string[];
  groupIds?: string[];
}
export interface ChartDrawingApi {
  readonly catalogVersion?: 2;
  readonly inspectVersion?: 1;
  readonly drawingSettingsVersion?: 1;
  readonly capabilitySchemaHash?: string;
  binding?(): ChartBinding;
  /** Optional readiness fence for negotiated navigation. */
  assertIdle?(): void;
  invalidatePreparations(): void;
  context(options?: { catalogVersion?: 2; inspectVersion?: 1 }): ChartContext;
  readBars(input: { from: number; to: number }): {
    bars: ChartBar[];
    coverage: { from: number | null; to: number | null; complete: boolean };
  };
  list(
    input: { offset: number; limit: number },
    options?: { catalogVersion?: 2; inspectVersion?: 1 },
  ): {
    drawings: DrawingSummary[];
    total: number;
  };
  /** Exact-ID read; null only when the drawing is not on this chart. */
  inspectDrawing?(id: string, options?: { catalogVersion?: 2 }): import('./capabilities.js').InspectedDrawing | null;
  listGroups?(input: { offset: number; limit: number }): {
    groups: DrawingGroupSummary[];
    total: number;
  };
  prepare(batch: DrawingBatch): PreparedDrawingBatch;
  acquireMutationLease(operationId: string): () => void;
  commit(operationId: string): DrawingReceipt;
  discard(operationId: string): void;
  updatePersistenceRevision(revision: number): void;
  exportDocument(): DrawingDocument;
  restoreDocument(document: DrawingDocument): void;
  resetDocument(): void;
  subscribe(listener: () => void): () => void;
  isNextUndo(operationId: string): boolean;
  undo(operationId: string): boolean;
  destroy(): void;
}
export interface DrawingDocumentPort {
  load(): Promise<DrawingDocument | null>;
  save(
    document: DrawingDocument,
    expectedRevision: number,
    operationId: string,
  ): Promise<DrawingDocument>;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ChartCommandError("invalid_input");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new ChartCommandError("invalid_input");
}
function string(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length || value.length > 256)
    throw new ChartCommandError("invalid_input");
}
function integer(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new ChartCommandError("invalid_input");
}
/**
 * `ref:<name>` points at a drawing created earlier in the same batch. Only
 * negotiated member lists may carry one, and only for a name already declared.
 */
function groupMemberIds(
  value: unknown,
  refs: ReadonlySet<string> | null = null,
): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > GROUP_MEMBERS_LIMIT
  )
    throw new ChartCommandError("limit_exceeded");
  for (const member of value) {
    string(member);
    if (!(member as string).startsWith(REF_PREFIX)) continue;
    if (!refs) throw new ChartCommandError("unsupported");
    if (!refs.has((member as string).slice(REF_PREFIX.length)))
      throw new ChartCommandError("invalid_input");
  }
  if (new Set(value).size !== value.length)
    throw new ChartCommandError("invalid_input");
  return value;
}
function groupName(value: unknown): void {
  string(value);
  if (!(value as string).trim() || (value as string).length > 100)
    throw new ChartCommandError("invalid_input");
}
function validateGroupOperation(
  op: Record<string, unknown>,
  refs: ReadonlySet<string> | null,
): void {
  if (op.action === "group.create") {
    keys(op, ["action", "name", "ids"]);
    groupName(op.name);
    if (groupMemberIds(op.ids, refs).length < GROUP_MEMBERS_MIN)
      throw new ChartCommandError("invalid_input");
    return;
  }
  string(op.id);
  if (op.action === "group.rename") {
    keys(op, ["action", "id", "name"]);
    groupName(op.name);
    return;
  }
  if (op.action === "group.members") {
    keys(op, ["action", "id", "add", "remove"]);
    if (op.add === undefined && op.remove === undefined)
      throw new ChartCommandError("invalid_input");
    const add = op.add === undefined ? [] : groupMemberIds(op.add, refs);
    const remove = op.remove === undefined ? [] : groupMemberIds(op.remove);
    if (add.length + remove.length > GROUP_MEMBERS_LIMIT)
      throw new ChartCommandError("limit_exceeded");
    if (add.some((id) => remove.includes(id)))
      throw new ChartCommandError("invalid_input");
    return;
  }
  if (op.action === "group.visibility") {
    keys(op, ["action", "id", "visible"]);
    if (typeof op.visible !== "boolean")
      throw new ChartCommandError("invalid_input");
    return;
  }
  if (op.action === "group.lock") {
    keys(op, ["action", "id", "locked", "confirmUserIntent"]);
    if (typeof op.locked !== "boolean" || op.confirmUserIntent !== true)
      throw new ChartCommandError("invalid_input");
    return;
  }
  keys(op, ["action", "id"]);
}
export function validateBinding(value: unknown): ChartBinding {
  const v = record(value);
  keys(v, [
    "documentId",
    "instanceId",
    "epoch",
    "symbol",
    "interval",
    "revision",
  ]);
  string(v.documentId);
  string(v.instanceId);
  string(v.interval);
  integer(v.epoch);
  integer(v.revision);
  const symbol = record(v.symbol);
  keys(symbol, ["ticker", "currencyId", "unitId"]);
  string(symbol.ticker);
  for (const key of ["currencyId", "unitId"])
    if (symbol[key] !== undefined && symbol[key] !== null) string(symbol[key]);
  return structuredClone(v) as unknown as ChartBinding;
}
/** Primitive settings compare by value so a style/settings alias may repeat itself. */
function sameSettingValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function validateSettingsShape(
  op: Record<string, unknown>,
  creating: boolean,
): void {
  const settings =
    op.settings === undefined ? undefined : record(op.settings);
  if (
    settings &&
    (!Object.keys(settings).length ||
      Object.keys(settings).length > DRAWING_SETTINGS_LIMITS.fields)
  )
    throw new ChartCommandError("invalid_input");
  if (op.reset !== undefined) {
    if (
      creating ||
      !Array.isArray(op.reset) ||
      !op.reset.length ||
      op.reset.length > DRAWING_SETTINGS_LIMITS.fields ||
      new Set(op.reset).size !== op.reset.length
    )
      throw new ChartCommandError("invalid_input");
    for (const id of op.reset) string(id);
  }
  // `style` is a legacy alias of the same fields; two spellings must agree.
  if (settings && op.style !== undefined) {
    const style = op.style as Record<string, unknown>;
    for (const key of Object.keys(style))
      if (Object.hasOwn(settings, key) && !sameSettingValue(style[key], settings[key]))
        throw new ChartCommandError("invalid_input");
  }
}
export function validateOperations(
  value: unknown,
  catalogVersion?: 2,
  settingsVersion?: 1,
): DrawingOperation[] {
  assertBytes(value);
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > LIMITS.operationsPerBatch
  )
    throw new ChartCommandError("limit_exceeded");
  const declaredRefs = new Set<string>();
  for (const raw of value) {
    const op = record(raw);
    if (GROUP_ACTIONS.includes(op.action as DrawingGroupOperation["action"])) {
      if (catalogVersion !== 2) throw new ChartCommandError("unsupported");
      validateGroupOperation(
        op,
        settingsVersion === 1 ? declaredRefs : null,
      );
      continue;
    }
    if (!["create", "update", "delete"].includes(String(op.action)))
      throw new ChartCommandError("invalid_input");
    const creating = op.action === "create";
    const settingsAllowed = settingsVersion === 1 && catalogVersion === 2;
    if (
      (op.settings !== undefined ||
        op.reset !== undefined ||
        op.ref !== undefined) &&
      !settingsAllowed
    )
      throw new ChartCommandError("unsupported");
    keys(
      op,
      creating
        ? ["action", "type", "points", "style", "settings", "ref"]
        : op.action === "delete"
          ? ["action", "id", "unlock"]
          : ["action", "id", "points", "style", "settings", "reset", "unlock"],
    );
    if (op.settings !== undefined || op.reset !== undefined)
      validateSettingsShape(op, creating);
    if (op.ref !== undefined) {
      if (
        typeof op.ref !== "string" ||
        !REF_NAME.test(op.ref) ||
        declaredRefs.has(op.ref)
      )
        throw new ChartCommandError("invalid_input");
      declaredRefs.add(op.ref);
    }
    if (
      creating &&
      !drawingTypesForCatalog(catalogVersion).includes(op.type as DrawingType)
    )
      throw new ChartCommandError("unsupported");
    if (!creating) string(op.id);
    if (op.unlock !== undefined && typeof op.unlock !== "boolean")
      throw new ChartCommandError("invalid_input");
    if (creating || op.points !== undefined) {
      if (
        !Array.isArray(op.points) ||
        !op.points.length ||
        op.points.length > (catalogVersion === 2 ? 3 : 2)
      )
        throw new ChartCommandError("invalid_input");
      for (const rawPoint of op.points) {
        const p = record(rawPoint);
        keys(p, ["time", "price"]);
        if (
          (p.time === undefined && p.price === undefined) ||
          (p.time !== undefined && !Number.isSafeInteger(p.time)) ||
          (p.price !== undefined &&
            (typeof p.price !== "number" || !Number.isFinite(p.price)))
        )
          throw new ChartCommandError("invalid_input");
      }
    }
    if (op.style !== undefined) {
      const style = record(op.style);
      keys(style, ["color", "lineWidth", "lineStyle", "fillOpacity", "text"]);
      if (
        creating &&
        Object.keys(style).some(
          (key) =>
            !drawingStyleFields(op.type as DrawingType).includes(
              key as keyof DrawingStyle,
            ),
        )
      )
        throw new ChartCommandError("unsupported");
      if (
        style.color !== undefined &&
        (typeof style.color !== "string" ||
          !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(style.color))
      )
        throw new ChartCommandError("invalid_input");
      if (
        style.lineWidth !== undefined &&
        (!Number.isInteger(style.lineWidth) ||
          Number(style.lineWidth) < 1 ||
          Number(style.lineWidth) > 8)
      )
        throw new ChartCommandError("invalid_input");
      if (
        style.lineStyle !== undefined &&
        !["solid", "dashed", "dotted"].includes(String(style.lineStyle))
      )
        throw new ChartCommandError("invalid_input");
      if (
        style.fillOpacity !== undefined &&
        (typeof style.fillOpacity !== "number" ||
          !Number.isFinite(style.fillOpacity) ||
          style.fillOpacity < 0 ||
          style.fillOpacity > 1)
      )
        throw new ChartCommandError("invalid_input");
      if (
        style.text !== undefined &&
        (typeof style.text !== "string" || style.text.length > 2000)
      )
        throw new ChartCommandError("invalid_input");
    }
    if (
      op.action === "update" &&
      op.points === undefined &&
      op.style === undefined &&
      op.settings === undefined &&
      op.reset === undefined &&
      op.unlock !== true
    )
      throw new ChartCommandError("invalid_input");
  }
  return structuredClone(value) as DrawingOperation[];
}
export function validateBatch(value: unknown): DrawingBatch {
  assertBytes(value);
  const v = record(value);
  keys(v, [
    "version",
    "operationId",
    "binding",
    "operations",
    "catalogVersion",
    "drawingSettingsVersion",
  ]);
  if (v.version !== 1) throw new ChartCommandError("unsupported");
  if (v.catalogVersion !== undefined && v.catalogVersion !== 2)
    throw new ChartCommandError("unsupported");
  if (v.drawingSettingsVersion !== undefined && v.drawingSettingsVersion !== 1)
    throw new ChartCommandError("unsupported");
  string(v.operationId);
  return {
    version: 1,
    operationId: v.operationId,
    binding: validateBinding(v.binding),
    operations: validateOperations(
      v.operations,
      v.catalogVersion as 2 | undefined,
      v.drawingSettingsVersion as 1 | undefined,
    ),
    ...(v.catalogVersion === 2 ? { catalogVersion: 2 as const } : {}),
    ...(v.drawingSettingsVersion === 1
      ? { drawingSettingsVersion: 1 as const }
      : {}),
  };
}



export function validateReadRequest(
  kind: "context" | "bars" | "list" | "groups",
  value: unknown,
): Record<string, unknown> {
  const input = record(value);
  if (kind === "context") keys(input, []);
  if (kind === "bars") {
    keys(input, ["from", "to"]);
    if (
      !Number.isSafeInteger(input.from) ||
      !Number.isSafeInteger(input.to) ||
      Number(input.from) > Number(input.to)
    )
      throw new ChartCommandError("invalid_input");
  }
  if (kind === "list" || kind === "groups") {
    keys(input, ["offset", "limit"]);
    integer(input.offset);
    integer(input.limit);
    if (
      Number(input.limit) < 1 ||
      Number(input.limit) > LIMITS.summariesPerPage
    )
      throw new ChartCommandError("limit_exceeded");
  }
  return structuredClone(input);
}
