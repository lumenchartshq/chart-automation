export const CHART_ERROR_CODES = [
  "invalid_input", "limit_exceeded", "unsupported", "stale_binding", "revision_conflict",
  "busy", "locked", "ambiguous_target", "missing_history", "unavailable", "expired",
  "cancelled", "operation_conflict", "persistence_unresolved",
] as const;
export type ChartErrorCode = (typeof CHART_ERROR_CODES)[number];

/**
 * Where an input was rejected and why, so a model can correct its call.
 * `path` names declared fields and array indexes (`operations[2].points[0].time`);
 * `reason` is a short fixed phrase (`expected integer`). Neither carries input
 * values or host text.
 */
export interface ChartErrorDetails {
  path?: string;
  reason?: string;
}

export const CHART_ERROR_DETAIL_LIMITS = { pathLength: 256, reasonLength: 64 } as const;
/** Dot-separated identifiers with `[n]` indexes, e.g. `operations[2].points[0].time`. */
const DETAIL_PATH = /^(?:[A-Za-z_$][\w$-]*|\[\d+\])(?:\.[A-Za-z_$][\w$-]*|\[\d+\])*$/;
const DETAIL_REASON = /^[a-z][a-z ]*[a-z]$/;

/** Errors may originate in a separately bundled iframe or chart runtime. */
export function chartCommandErrorCode(error: unknown): ChartErrorCode {
  if (error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && CHART_ERROR_CODES.includes(error.code as ChartErrorCode))
    return error.code as ChartErrorCode;
  return "unavailable";
}

/** Validated, bounded details from untrusted input (for example a received envelope); anything else is dropped. */
export function parseChartErrorDetails(value: unknown): ChartErrorDetails | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { path, reason } = value as Record<string, unknown>;
  const details: ChartErrorDetails = {};
  if (typeof path === "string" && path.length <= CHART_ERROR_DETAIL_LIMITS.pathLength && DETAIL_PATH.test(path)) details.path = path;
  if (typeof reason === "string" && reason.length <= CHART_ERROR_DETAIL_LIMITS.reasonLength && DETAIL_REASON.test(reason)) details.reason = reason;
  return details.path !== undefined || details.reason !== undefined ? details : undefined;
}

/** The validated details of a thrown error, like `chartCommandErrorCode` for its code. */
export function chartErrorDetails(error: unknown): ChartErrorDetails | undefined {
  if (!error || typeof error !== "object" || !("details" in error)) return undefined;
  return parseChartErrorDetails(error.details);
}

export class ChartCommandError extends Error {
  /** Present only when the thrower located the problem; see `ChartErrorDetails`. */
  declare readonly details?: ChartErrorDetails;
  constructor(
    public readonly code: ChartErrorCode,
    message: string = code,
    details?: ChartErrorDetails,
  ) {
    super(message);
    this.name = "ChartCommandError";
    if (details) Object.defineProperty(this, "details", { value: Object.freeze({ ...details }), enumerable: true });
  }
}
