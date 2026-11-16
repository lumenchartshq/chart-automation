/** Inclusive visible time range in UTC epoch seconds, as reported by the public widget API. */
export interface EpochSecondsRange { from: number; to: number }
/** Inclusive time range in UTC epoch milliseconds, as used by command and automation contracts. */
export interface EpochMillisecondsRange { from: number; to: number }

/** The single conversion from the widget's second-based range to contract milliseconds. */
export function epochSecondsRangeToMilliseconds(range: EpochSecondsRange | null): EpochMillisecondsRange | null {
  if (!range) return null;
  return { from: Math.round(range.from * 1000), to: Math.round(range.to * 1000) };
}
