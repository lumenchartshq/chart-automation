export type NativeHistoryDomain = 'drawings' | 'groups' | 'studies' | 'comparisons' | 'panes' | 'scales';
export interface HistoryEntityDelta { id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export interface NativeHistoryEntry {
  id: string;
  label: string;
  origin: 'user' | 'ai';
  operationId?: string;
  changes: Partial<Record<NativeHistoryDomain, HistoryEntityDelta[]>>;
}
