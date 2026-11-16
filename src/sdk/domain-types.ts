/**
 * Domain types that SDK signatures name (native owners, built-in command
 * inputs and outputs), re-exported so integrators need only `/sdk`.
 */
export type { ChartBar, ChartBinding, DrawingDocument, EpochSecondsRange, StudyDocument } from '../core-contracts/index.js';
export type {
  ChartContext, ChartDrawingApi, CommandState, DrawingBatch, DrawingOperation, DrawingPoint, DrawingReceipt, DrawingSettings,
  DrawingStyle, DrawingSummary, DrawingType, PreparedDrawingBatch,
} from '../contracts.js';
export type { DrawingGroupOperation, DrawingGroupSummary } from '../organization.js';
export type {
  BuiltInStudyId, ChartStudyApi, ChartStudyContext, PreparedStudyBatch, StudyBatch, StudyInputs, StudyList, StudyOperation, StudyPlacement,
  StudyReceipt, StudyStyles, StudySummary, StudyTypeId,
} from '../studies.js';
export type { ChartSettings, ChartSettingsApi, ChartSettingsIntent, ChartSettingsReceipt } from '../chart-settings.js';
export type {
  ChartWorkspaceApi, PreparedWorkspace, WorkspaceChart, WorkspaceContext, WorkspaceDocument, WorkspaceLayout, WorkspaceSelection,
} from '../workspace.js';
export type {
  CapabilityCatalogDetail, CapabilityCatalogPage, CapabilityCatalogQuery, CapabilityField, ChartCapability, EntityInspection,
  InspectedChart, InspectedDrawing, InspectedStudy, StudyCapability,
} from '../capabilities.js';
