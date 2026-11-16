/** Stable chart-owned persistence values; independent of automation. */
export interface ChartBinding {
  documentId: string;
  instanceId: string;
  epoch: number;
  symbol: {
    ticker: string;
    currencyId?: string | null;
    unitId?: string | null;
  };
  interval: string;
  revision: number;
}
export interface DrawingDocument {
  version: 1;
  documentId: string;
  revision: number;
  payload: Record<string, unknown>;
}
export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
export type ChartPane = { id: string; height: number; collapsed: boolean; sources: string[] };
export type ChartDocumentPayload = {
  version: 3;
  panes: ChartPane[];
  studies: Record<string, unknown>[];
  comparisons: Record<string, unknown>[];
  priceScales: Record<string, unknown>;
};
export interface StudyDocument { version: 1; documentId: string; chartId: string; revision: number; payload: ChartDocumentPayload }
export interface ChartDocumentApi<T> {
  exportDocument(): T;
  restoreDocument(document: T): void;
  updatePersistenceRevision(revision: number): void;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}
export interface ChartDrawingDocumentApi extends ChartDocumentApi<DrawingDocument> { resetDocument(): void }
export type ChartStudyDocumentApi = ChartDocumentApi<StudyDocument>;
