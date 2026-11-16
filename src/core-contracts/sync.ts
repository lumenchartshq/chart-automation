import { ChartCommandError } from "./errors.js";
export const SYNC_KEYS = ["crosshair", "time", "dateRange"] as const;
export type ChartSyncKey = (typeof SYNC_KEYS)[number];
export type ChartSyncControl = ChartSyncKey | "symbol" | "interval";
/** Cross-chart sync switches, saved as part of the workspace document. */
export interface WorkspaceSync {
  crosshair: boolean;
  time: boolean;
  dateRange: boolean;
}
export const initialWorkspaceSync = (): WorkspaceSync => ({
  crosshair: false,
  time: false,
  dateRange: false,
});
export function validateWorkspaceSync(raw: unknown): WorkspaceSync {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ChartCommandError("invalid_input");
  const v = raw as Record<string, unknown>;
  if (
    Object.keys(v).some((key) => !(SYNC_KEYS as readonly string[]).includes(key)) ||
    SYNC_KEYS.some((key) => typeof v[key] !== "boolean")
  )
    throw new ChartCommandError("invalid_input");
  return {
    crosshair: v.crosshair as boolean,
    time: v.time as boolean,
    dateRange: v.dateRange as boolean,
  };
}
export interface ChartSyncSnapshot {
  supported: readonly ChartSyncControl[];
  values: Partial<Record<ChartSyncControl, boolean>>;
  pending: boolean;
  notice?: string;
}
/** UI emits requests; the host persists and applies authoritative preferences. */
export interface ChartSyncUiPort {
  snapshot(): ChartSyncSnapshot;
  subscribe(listener: () => void): () => void;
  request(key: ChartSyncControl, value: boolean): Promise<void>;
}
export interface ChartSyncOutcome {
  chartId: string;
  state: "applied" | "rejected";
  code?: "missing_history" | "unavailable" | "busy";
  visibleRange?: { from: number; to: number } | null;
}
export interface ChartWorkspaceSyncApi {
  readonly version: 1;
  restore(sync: WorkspaceSync): void;
  /** Effective switches: a single visible chart reports every switch off. */
  preferences(): WorkspaceSync;
  /** Explicit propagation returns fresh outcomes even when the source range did not change. */
  synchronize(chartId: string): ChartSyncOutcome[];
  subscribe(listener: () => void): () => void;
  outcomes(): ChartSyncOutcome[];
}
