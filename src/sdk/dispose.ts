/**
 * Runs every disposer even when one fails, then rethrows the first failure so
 * callers see the original error rather than a wrapper.
 */
export function disposeAll(disposers: Iterable<() => void>): void {
  let failure: { error: unknown } | undefined;
  for (const dispose of disposers) {
    try { dispose(); } catch (error) { failure ??= { error }; }
  }
  if (failure) throw failure.error;
}
