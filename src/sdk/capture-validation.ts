import { ChartCommandError } from '../core-contracts/index.js';
import type { AutomationCapture, AutomationTarget } from './contracts.js';
import { AUTOMATION_CEILINGS } from './execution.js';

const invalid = () => new ChartCommandError('invalid_input');
const isDimension = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= AUTOMATION_CEILINGS.imageDimension;

function validateVisibleRange(range: AutomationCapture['visibleRange']): void {
  if (range === null) return;
  if (!range || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to)) throw invalid();
  if (range.from > range.to) throw invalid();
}

function validateBlob(blob: Blob): void {
  if (blob.type !== 'image/png' || typeof blob.arrayBuffer !== 'function') throw invalid();
  if (!Number.isSafeInteger(blob.size) || blob.size < 1) throw invalid();
  if (blob.size > AUTOMATION_CEILINGS.imageBytes) throw new ChartCommandError('limit_exceeded');
}

/** Rejects host results for another target and returns a detached copy of the metadata. */
export function validateAutomationCapture(result: AutomationCapture, target: AutomationTarget): AutomationCapture {
  if (!result || !result.target || !result.blob) throw invalid();
  if (result.target.id !== target.id || result.target.generation !== target.generation) throw new ChartCommandError('stale_binding');
  if (typeof result.revision !== 'string' || !result.revision) throw invalid();
  if (typeof result.capturedAt !== 'string' || !Number.isFinite(Date.parse(result.capturedAt))) throw invalid();
  if (!isDimension(result.width) || !isDimension(result.height)) throw invalid();
  validateVisibleRange(result.visibleRange);
  validateBlob(result.blob);
  return { ...result, target: { ...result.target }, visibleRange: result.visibleRange ? { ...result.visibleRange } : null };
}
