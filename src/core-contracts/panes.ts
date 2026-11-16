/** The main pane's fixed ID; every other pane has a generated `pane:` ID. */
export const STUDY_MAIN_PANE_ID = 'main';
/** Placement target that asks the chart to create a pane. */
export const STUDY_NEW_PANE_ID = 'new';
export function newStudyPaneId(): string { return `pane:${randomPaneKey()}`; }
/** `crypto.randomUUID` exists only in secure contexts; a chart on a plain HTTP host still needs pane IDs. */
function randomPaneKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function isDetachedStudyPaneId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && value.startsWith('pane:') && value.length > 'pane:'.length;
}
export function isStudyPaneId(value: unknown): value is string {
  return value === STUDY_MAIN_PANE_ID || isDetachedStudyPaneId(value);
}
