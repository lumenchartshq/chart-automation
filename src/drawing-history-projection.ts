import { ChartCommandError } from './contracts.js';

export const DRAWING_HISTORY_PROJECTION_VERSION = 1 as const;
const SUPPORTED_LINE_TOOLS_VERSIONS = [2, 3] as const;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChartCommandError('invalid_input');
  return value as Record<string, unknown>;
}
function orderedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, orderedJsonValue(child)]));
}
/** Comparison only: canonical anchors/settings remain exact; native serialization caches do not attribute edits. */
export function canonicalDrawingHistoryDocument(payload: unknown): Record<string, unknown> {
  const document = structuredClone(record(payload));
  // Line-tools versions 2 and 3 share one shape (3 only pinned the field allowlist).
  if (!SUPPORTED_LINE_TOOLS_VERSIONS.includes(document.version as never)) throw new ChartCommandError('unsupported');
  const sources = document.sources === null ? {} : record(document.sources);
  const entries = Object.entries(sources).filter(([, source]) => source !== null);
  const previousOrder = document.historyProjectionVersion === DRAWING_HISTORY_PROJECTION_VERSION && Array.isArray(document.historySourceOrder) ? document.historySourceOrder : [];
  if (previousOrder.length === entries.length && previousOrder.every(id => typeof id === 'string' && Object.hasOwn(sources, id)) && new Set(previousOrder).size === entries.length) entries.sort(([left], [right]) => previousOrder.indexOf(left) - previousOrder.indexOf(right));
  const sorted = entries.map(([id, raw]) => {
    const source = record(raw), state = record(source.state);
    if (typeof state.zorder !== 'number' && state.zorder !== undefined) throw new ChartCommandError('invalid_input');
    if (typeof state.zorder === 'number' && !Number.isFinite(state.zorder)) throw new ChartCommandError('invalid_input');
    return { id, source, state };
  }).sort((left, right) => Number(left.state.zorder ?? 0) - Number(right.state.zorder ?? 0));
  document.sources = Object.fromEntries(sorted.map(({ id, source, state }, index) => {
    delete state.normalizedPoints;
    state.zorder ??= index;
    for (const key of ['visible', 'isSelectionEnabled', 'userEditEnabled', 'saveEnabled', 'showInObjectsTree']) state[key] ??= true;
    source.currencyId ??= null; source.unitId ??= null;
    return [id, source];
  }));
  document.historyProjectionVersion = DRAWING_HISTORY_PROJECTION_VERSION;
  document.historySourceOrder = [...sorted].sort((left, right) => Number(left.state.zorder) - Number(right.state.zorder)).map(({ id }) => id);
  const groups = Object.fromEntries(Object.entries(record(document.drawing_groups)).filter(([, group]) => group !== null));
  document.drawing_groups = groups;
  for (const raw of Object.values(groups)) {
    const group = record(raw); group.currencyId ??= null; group.unitId ??= null;
    group.visible ??= true; group.locked ??= false;
  }
  return record(orderedJsonValue(document));
}
