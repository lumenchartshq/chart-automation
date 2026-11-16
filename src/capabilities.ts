import type { ChartBinding, DrawingPoint, DrawingType } from './contracts.js';

export const CHART_INSPECT_VERSION = 1 as const;
export type CapabilityValueKind = 'color' | 'number' | 'integer' | 'boolean' | 'enum' | 'text' | 'collection';
export interface CapabilityField {
  id: string;
  title: string;
  kind: CapabilityValueKind;
  writable: boolean;
  default?: string | number | boolean | null;
  choices?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
  /** Text length limit; defaults to 2000. */
  maxLength?: number;
  unit?: 'px' | 'percent' | 'price' | 'bars';
  appliesWhen?: { field: string; equals: string | number | boolean };
  item?: readonly CapabilityField[];
  maxItems?: number;
}
export interface DrawingCapability {
  kind: 'drawing';
  id: DrawingType;
  title: string;
  anchors: { min: number; max: number; roles: readonly ('time_price' | 'time' | 'price')[] };
  fields: readonly CapabilityField[];
  operations: readonly ('create' | 'update' | 'delete' | 'group')[];
  targets: readonly 'main-series'[];
}
export interface StudyCapability {
  kind: 'study';
  id: string;
  title: string;
  placement: 'overlay' | 'pane';
  inputs: readonly CapabilityField[];
  plots: readonly { id: string; title: string; fields: readonly CapabilityField[] }[];
  bands?: readonly { id: string; title: string; fields: readonly CapabilityField[] }[];
  fills?: readonly { id: string; title: string; fields: readonly CapabilityField[] }[];
}
/** Chart-level settings of one chart: its type and its main price scale. */
export interface ChartSettingsCapability {
  kind: 'chart';
  id: 'chart';
  title: string;
  fields: readonly CapabilityField[];
}
export type ChartCapability = DrawingCapability | StudyCapability | ChartSettingsCapability;
export interface CapabilityCatalogPage {
  version: 1;
  schemaHash: string;
  entries: readonly { kind: ChartCapability['kind']; id: string; title: string; summary: string }[];
  nextCursor: string | null;
}
export interface CapabilityCatalogDetail {
  version: 1;
  schemaHash: string;
  capability: ChartCapability;
}
export interface EntityInspection {
  version: 1;
  schemaHash: string;
  binding: ChartBinding;
  entities: readonly (
    | {
        kind: 'drawing'; id: string;
        /** Native family. Families outside the snapshot report no points, values or explicit fields and are never editable. */
        family: DrawingType | (string & {});
        title: string | null; points: DrawingPoint[]; visible: boolean; locked: boolean; selected: boolean;
        /** Certified for this turn's catalog, main-series owned, saved and unlocked. */
        editable: boolean;
        owner: string; values: Record<string, unknown>; explicit: readonly string[];
      }
    | {
        kind: 'study'; id: string; studyId: string; title: string;
        /**
         * Version 1 derives this from display position (`main` or `pane:<index>`),
         * so it changes when panes are reordered. Study placement (Slice D)
         * replaces it with a native stable pane ID; do not persist it.
         */
        paneId: string;
        paneIndex: number; scale: string; visible: boolean; editable: boolean;
        inputs: Record<string, unknown>; styles: Record<string, unknown>;
      }
    | {
        kind: 'chart'; id: string;
        /** Effective chart settings, keyed by the chart capability's field ids. */
        values: Record<string, unknown>;
        /** Chart types this chart can show now (feature-gated types may be absent). */
        chartTypes: readonly string[];
        editable: boolean;
      }
  )[];
  missing: readonly string[];
}
export type InspectedDrawing = Extract<EntityInspection['entities'][number], { kind: 'drawing' }>;
export type InspectedStudy = Extract<EntityInspection['entities'][number], { kind: 'study' }>;
export type InspectedChart = Extract<EntityInspection['entities'][number], { kind: 'chart' }>;

export interface CapabilityCatalogQuery {
  id?: string;
  kind?: ChartCapability['kind'];
  search?: string;
  cursor?: string;
}

export interface EntityInspectionRequest {
  entities: readonly { kind: 'drawing' | 'study' | 'chart'; id: string }[];
}
