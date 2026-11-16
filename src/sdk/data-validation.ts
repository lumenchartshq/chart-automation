import { ChartCommandError } from '../core-contracts/index.js';
import {
  AUTOMATION_SERIES_KINDS, AUTOMATION_SERIES_READINESS,
  type AutomationDataRequest, type AutomationDataResult, type AutomationSeries,
} from './contracts.js';
import { assertMessage, AUTOMATION_CEILINGS } from './execution.js';
import { field, objectSchema, strictRecord } from './schema.js';

const SERIES_ID_LENGTH = 256;
const FIELD_NAME_LENGTH = 128;
const UNIT_LENGTH = 256;
const RESERVED_FIELD = 'time';

/** Shared by `data.read`, `data.requestHistory` and their model tools. */
export const dataRequestSchema = objectSchema({
  seriesId: field.string(SERIES_ID_LENGTH),
  from: field.integer(),
  to: field.integer(),
  limit: field.integer({ minimum: 1, maximum: AUTOMATION_CEILINGS.rows }),
});

const invalid = () => new ChartCommandError('invalid_input');
const seriesId = field.string(SERIES_ID_LENGTH);
const fieldName = field.string(FIELD_NAME_LENGTH);
const unit = field.optional(field.string(UNIT_LENGTH));
const optionalFlag = (value: unknown) => {
  if (value !== undefined && typeof value !== 'boolean') throw invalid();
};

function validateSeriesFields(fields: unknown): void {
  if (!Array.isArray(fields)) throw invalid();
  if (fields.length > AUTOMATION_CEILINGS.fieldsPerSeries) throw new ChartCommandError('limit_exceeded');
  const names = new Set<string>();
  for (const raw of fields) {
    const declared = strictRecord(raw, ['name', 'type', 'unit', 'optional', 'nullable']);
    const name = fieldName.parse(declared.name);
    if (name === RESERVED_FIELD || names.has(name) || declared.type !== 'number') throw invalid();
    names.add(name);
    unit.parse(declared.unit);
    optionalFlag(declared.optional);
    optionalFlag(declared.nullable);
  }
}

/** Snapshot the advertised contract before handing control to an async provider. */
export function validateAutomationSeries(value: unknown, messageBytes: number): AutomationSeries[] {
  if (!Array.isArray(value)) throw invalid();
  if (value.length > AUTOMATION_CEILINGS.series) throw new ChartCommandError('limit_exceeded');
  const ids = new Set<string>();
  for (const raw of value) {
    const series = strictRecord(raw, ['id', 'kind', 'fields', 'timeUnit', 'readiness']);
    const id = seriesId.parse(series.id);
    if (ids.has(id)) throw invalid();
    ids.add(id);
    if (!AUTOMATION_SERIES_KINDS.includes(series.kind as AutomationSeries['kind'])) throw invalid();
    if (!AUTOMATION_SERIES_READINESS.includes(series.readiness as AutomationSeries['readiness'])) throw invalid();
    if (series.timeUnit !== 'milliseconds') throw invalid();
    validateSeriesFields(series.fields);
  }
  assertMessage(value, messageBytes);
  return structuredClone(value) as AutomationSeries[];
}

/** Parses the request into a detached copy and resolves its declared series. */
export function validateAutomationRead(input: AutomationDataRequest, series: readonly AutomationSeries[]): { request: AutomationDataRequest; series: AutomationSeries } {
  const request = dataRequestSchema.parse(input);
  if (request.from > request.to) throw invalid();
  const descriptor = series.find(item => item.id === request.seriesId);
  if (!descriptor) throw new ChartCommandError('unsupported');
  return { request, series: descriptor };
}

function validateRow(raw: unknown, keys: readonly string[], input: AutomationDataRequest, series: AutomationSeries, previousTime: number): number {
  const row = strictRecord(raw, keys);
  const time = row.time;
  if (!Number.isSafeInteger(time)) throw invalid();
  const ms = time as number;
  if (ms < input.from || ms > input.to || ms <= previousTime) throw invalid();
  for (const declared of series.fields) {
    if (!Object.hasOwn(row, declared.name)) {
      if (declared.optional) continue;
      throw invalid();
    }
    const value = row[declared.name];
    if (value === null && declared.nullable) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid();
  }
  return ms;
}

function validateCoverage(raw: unknown, input: AutomationDataRequest): void {
  const coverage = strictRecord(raw, ['from', 'to', 'complete']);
  const bound = (value: unknown) => value === null || Number.isSafeInteger(value);
  if (typeof coverage.complete !== 'boolean' || !bound(coverage.from) || !bound(coverage.to)) throw invalid();
  const from = coverage.from as number | null;
  const to = coverage.to as number | null;
  if (from !== null && to !== null && from > to) throw invalid();
  if (!coverage.complete) return;
  // Complete coverage must actually span the requested window.
  if (from === null || to === null || input.from < from || input.to > to) throw invalid();
}

export function validateAutomationRows(input: AutomationDataRequest, result: AutomationDataResult, series: AutomationSeries, messageBytes: number): AutomationDataResult {
  strictRecord(result, ['seriesId', 'revision', 'rows', 'coverage']);
  if (result.seriesId !== input.seriesId) throw invalid();
  if (typeof result.revision !== 'string' || !result.revision) throw invalid();
  if (!Array.isArray(result.rows) || result.rows.length > input.limit) throw invalid();
  const keys = [RESERVED_FIELD, ...series.fields.map(declared => declared.name)];
  let previousTime = -Infinity;
  for (const row of result.rows) previousTime = validateRow(row, keys, input, series, previousTime);
  validateCoverage(result.coverage, input);
  assertMessage(result, messageBytes);
  return structuredClone(result);
}
