import { ChartCommandError, epochSecondsRangeToMilliseconds, type ChartBar, type EpochSecondsRange } from '../core-contracts/index.js';
import type { AutomationEvent, AutomationHost, AutomationPolicy, AutomationSeries } from './contracts.js';
import type { ChartAutomation } from './chart-automation.js';
import { createChartAutomation } from './session.js';
import { decodeChartPng, readChartPng } from './capture.js';
import { disposeAll } from './dispose.js';

interface Subscription {
  subscribe(owner: unknown, listener: (...args: unknown[]) => void): void;
  unsubscribe(owner: unknown, listener: (...args: unknown[]) => void): void;
}
/** Structural public API only: this adapter has no chart-engine imports. */
export interface NativeAutomationChart {
  /** `from`/`to`, bar times and coverage are UTC epoch milliseconds. */
  readLoadedBars(input: { from: number; to: number; limit?: number }): { bars: ChartBar[]; coverage: { from: number | null; to: number | null; complete: boolean } };
  /** UTC epoch seconds (the public widget API unit); converted to milliseconds at this adapter. */
  getVisibleRange(): EpochSecondsRange | null;
  dataReady(): boolean;
  onSymbolChanged(): Subscription;
  onIntervalChanged(): Subscription;
  onDataChanged(): Subscription;
  /**
   * Optional. When present, captures also reject a viewport that moves and returns
   * to the same range; without it, only the before/after range comparison applies.
   */
  onVisibleRangeChanged?(): Subscription;
  onRemoved(listener: () => void): () => void;
}
type HostData = NonNullable<AutomationHost['data']>;

const MAIN_SERIES_ID = 'main';
const MAIN_FIELDS = ['open', 'high', 'low', 'close', 'volume'].map(name => ({
  name,
  type: 'number' as const,
  ...(name === 'volume' ? { optional: true } : {}),
}));

const sameRange = (a: EpochSecondsRange | null, b: EpochSecondsRange | null) => a?.from === b?.from && a?.to === b?.to;

/** Bind to one exact chart. Capturing must use that chart's exact index/identity. */
export function createNativeChartAutomation(options: {
  chartId: string;
  chart: NativeAutomationChart;
  /** Captures this exact chart as a PNG data URL or PNG Blob (a Blob avoids base64 decoding). */
  capturePng?: () => Promise<string | Blob>;
  requestHistory?: HostData['requestHistory'];
  /** Optional comparison/study/Lumen Script provider; must expose stable namespaced IDs. */
  additionalData?: HostData;
  subscribeAdditionalData?: AutomationHost['subscribe'];
  policy?: AutomationPolicy;
}): ChartAutomation {
  const { chart, additionalData } = options;
  // Generation and revision advance from chart callbacks installed by `subscribe`,
  // which the session always installs at creation.
  let generation = 0;
  let revision = 0;
  let viewportRevision = 0;
  let removed = false;
  const currentTarget = () => ({ id: options.chartId, generation });

  const mainSeries = (): AutomationSeries => ({
    id: MAIN_SERIES_ID,
    kind: 'main',
    timeUnit: 'milliseconds',
    readiness: chart.dataReady() ? 'ready' : 'pending',
    fields: MAIN_FIELDS,
  });

  // Identity and shape (including duplicate IDs) are validated by the session.
  const data: HostData = {
    series: () => [mainSeries(), ...(additionalData?.series() ?? [])],
    read(input, context) {
      if (removed) throw new ChartCommandError('unavailable');
      if (input.seriesId !== MAIN_SERIES_ID) {
        if (!additionalData) throw new ChartCommandError('unsupported');
        return additionalData.read(input, context);
      }
      const result = chart.readLoadedBars(input);
      return { seriesId: MAIN_SERIES_ID, revision: String(revision), rows: result.bars, coverage: result.coverage };
    },
  };
  if (options.requestHistory || additionalData?.requestHistory) {
    data.requestHistory = (input, context) => {
      if (input.seriesId === MAIN_SERIES_ID) {
        if (!options.requestHistory) throw new ChartCommandError('unsupported');
        return options.requestHistory(input, context);
      }
      if (!additionalData?.requestHistory) throw new ChartCommandError('unsupported');
      return additionalData.requestHistory(input, context);
    };
  }

  const capturePng = options.capturePng;
  const capture: AutomationHost['capture'] = capturePng && {
    async image() {
      const target = currentTarget();
      const before = revision;
      const viewportBefore = viewportRevision;
      const range = chart.getVisibleRange();
      const image = await capturePng();
      const png = typeof image === 'string' ? decodeChartPng(image) : await readChartPng(image);
      const changed = removed || before !== revision || viewportBefore !== viewportRevision || target.generation !== generation || !sameRange(range, chart.getVisibleRange());
      if (changed) throw new ChartCommandError('stale_binding');
      return {
        ...png,
        target,
        capturedAt: new Date().toISOString(),
        revision: String(revision),
        visibleRange: epochSecondsRangeToMilliseconds(range),
      };
    },
  };

  const subscribe: AutomationHost['subscribe'] = listener => {
    const owner = {};
    const subscriptions: (() => void)[] = [];
    const publish = (type: AutomationEvent['type']) => listener({ type, target: currentTarget(), revision: String(revision) });
    // A symbol and interval change in one tick each advance the generation and
    // publish a selection event; only the latest target is current.
    const onSelection = () => { generation++; revision++; publish('selection'); };
    const onData = () => { revision++; publish('data'); };
    const watch = (subscription: Subscription, callback: () => void) => {
      subscriptions.push(() => subscription.unsubscribe(owner, callback));
      subscription.subscribe(owner, callback);
    };
    try {
      watch(chart.onSymbolChanged(), onSelection);
      watch(chart.onIntervalChanged(), onSelection);
      watch(chart.onDataChanged(), onData);
      const visibleRange = chart.onVisibleRangeChanged?.();
      if (visibleRange) watch(visibleRange, () => { viewportRevision++; });
      if (options.subscribeAdditionalData) {
        subscriptions.push(options.subscribeAdditionalData(event => {
          if (event.type !== 'data' && event.type !== 'study-ready') return;
          revision++;
          publish(event.type);
        }));
      }
      subscriptions.push(chart.onRemoved(() => { removed = true; generation++; publish('disposed'); }));
    } catch (error) {
      try { disposeAll(subscriptions.reverse()); } catch { /* Preserve installation failure. */ }
      throw error;
    }
    return () => disposeAll(subscriptions.splice(0));
  };

  const host: AutomationHost = { currentTarget, data, ...(capture ? { capture } : {}), subscribe };
  return createChartAutomation(host, options.policy);
}
