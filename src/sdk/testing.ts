import { ChartCommandError } from '../core-contracts/index.js';
import type {
  AutomationCapture, AutomationDataResult, AutomationEvent, AutomationHost, AutomationPolicy, AutomationSeries, AutomationTarget,
} from './contracts.js';
import type { ChartAutomation } from './chart-automation.js';
import { installNativeAutomationCommands, type NativeCommandOwners } from './native-commands.js';
import { createChartAutomation } from './session.js';

export { createFakeDrawingOwner, type FakeDrawingOwner, type FakeDrawingOwnerOptions } from './testing-drawing-owner.js';

type Row = AutomationDataResult['rows'][number];

/** A 1×1 PNG, enough for capture plumbing tests. */
const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII='), char => char.charCodeAt(0));

export interface TestAutomationOptions {
  chartId?: string;
  policy?: AutomationPolicy;
  /** Readable series; defaults to a ready `main` OHLC series. */
  series?: AutomationSeries[];
  /** Loaded rows by series ID, ordered by time (UTC milliseconds). */
  rows?: Record<string, Row[]>;
  /** Offer capture with a 1×1 PNG; defaults to true. */
  capture?: boolean;
  /**
   * Native owners (real or fake, e.g. `createFakeDrawingOwner()`) installed with
   * `installNativeAutomationCommands`, so `drawings.*`, `studies.*`, `settings.*`
   * and `workspace.*` run as they do on a chart. `binding` defaults to the
   * drawing owner's binding.
   */
  owners?: Omit<NativeCommandOwners, 'binding'> & { binding?: NativeCommandOwners['binding'] };
}

export interface TestAutomation {
  sdk: ChartAutomation;
  /** Simulates a symbol or interval change: advances the generation and publishes `selection`. */
  select(): AutomationTarget;
  /** Replaces a series' loaded rows and publishes `data`. */
  setRows(seriesId: string, rows: Row[]): void;
  /** Simulates chart removal: publishes `disposed`, which closes the session. */
  remove(): void;
}

const MAIN: AutomationSeries = {
  id: 'main',
  kind: 'main',
  timeUnit: 'milliseconds',
  readiness: 'ready',
  fields: ['open', 'high', 'low', 'close'].map(name => ({ name, type: 'number' as const })),
};

/**
 * An in-memory chart host for unit-testing commands, policies and tool
 * adapters without a widget. Reads honor the window and limit, and report
 * complete coverage only when the window fits inside the loaded rows.
 */
export function createTestAutomation(options: TestAutomationOptions = {}): TestAutomation {
  let target: AutomationTarget = { id: options.chartId ?? 'test-chart', generation: 0 };
  let revision = 0;
  const series = options.series ?? [MAIN];
  const rows = new Map(Object.entries(options.rows ?? {}));
  const listeners = new Set<(event: AutomationEvent) => void>();
  const publish = (type: AutomationEvent['type']) => {
    for (const listener of [...listeners]) listener({ type, target: { ...target }, revision: String(revision) });
  };

  const host: AutomationHost = {
    currentTarget: () => ({ ...target }),
    data: {
      series: () => series,
      read(input) {
        if (!series.some(entry => entry.id === input.seriesId)) throw new ChartCommandError('unsupported');
        const loaded = rows.get(input.seriesId) ?? [];
        const first = loaded[0]?.time ?? null;
        const last = loaded.at(-1)?.time ?? null;
        const window = loaded.filter(row => Number(row.time) >= input.from && Number(row.time) <= input.to).slice(0, input.limit);
        const complete = first !== null && last !== null && first <= input.from && last >= input.to;
        return { seriesId: input.seriesId, revision: String(revision), rows: window, coverage: { from: first, to: last, complete } };
      },
    },
    ...(options.capture === false ? {} : {
      capture: {
        async image(context): Promise<AutomationCapture> {
          return { blob: new Blob([PIXEL], { type: 'image/png' }), width: 1, height: 1, capturedAt: new Date().toISOString(), target: context.target, visibleRange: null, revision: String(revision) };
        },
      },
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const sdk = createChartAutomation(host, options.policy);
  if (options.owners) {
    const { binding, ...owners } = options.owners;
    const drawingBinding = owners.drawings?.binding?.bind(owners.drawings);
    const resolved = binding ?? drawingBinding;
    if (!resolved && (owners.drawings || owners.studies)) {
      sdk.destroy();
      throw new ChartCommandError('invalid_input', 'Drawing and study owners need a binding');
    }
    installNativeAutomationCommands(sdk, { ...owners, binding: resolved ?? (() => { throw new ChartCommandError('unsupported'); }) });
  }
  return {
    sdk,
    select() {
      target = { ...target, generation: target.generation + 1 };
      revision++;
      publish('selection');
      return { ...target };
    },
    setRows(seriesId, next) {
      rows.set(seriesId, next);
      revision++;
      publish('data');
    },
    remove() {
      target = { ...target, generation: target.generation + 1 };
      publish('disposed');
    },
  };
}
