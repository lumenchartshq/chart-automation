import {
  ChartCommandError, createAutomationTools, connectAutomation, defineCommand, field, serveAutomation,
  type AutomationPolicy, type AutomationRemoteCall, type AutomationRemoteResult, type AutomationToolMiddleware,
  type ChartAutomation, type NativeCommandOwners,
} from '../src/sdk/index.js';

/**
 * Compiled mirror of the automation docs (overview, extensions and
 * server-side models). Host functions are declared, not implemented.
 */
interface ChartWithAutomation {
  /** UTC epoch seconds. */
  getVisibleRange(): { from: number; to: number };
  openAutomation(options?: { commands?: readonly ('drawings' | 'studies' | 'settings')[]; policy?: AutomationPolicy; persist?: NativeCommandOwners['persist'] }): Promise<ChartAutomation>;
}
declare function fetchNextEarnings(symbol: string, signal: AbortSignal): Promise<number>;
declare function saveDocument(family: string, document: unknown, options: { operationId: string; signal: AbortSignal }): Promise<void>;
declare function askUser(question: string): Promise<boolean>;
declare function upload(blob: Blob): Promise<string>;
declare const channel: {
  onCall(handler: (call: unknown, signal: AbortSignal) => Promise<void>): void;
  reply(result: AutomationRemoteResult): Promise<void>;
  call(call: AutomationRemoteCall, signal: AbortSignal): Promise<AutomationRemoteResult>;
};

/** Reads the visible window: a bounded read, unlike one from 0 to now. */
export const lastVisibleClose = (chart: ChartWithAutomation) => defineCommand({
  name: 'acme.lastVisibleClose',
  effect: 'read',
  description: 'Return the close of the last bar in the visible range.',
  input: {},
  output: { close: field.nullable(field.number()).describe('Last visible close, or null when no bar is visible.') },
  async execute(_input, context) {
    const { from, to } = chart.getVisibleRange(); // UTC seconds
    const { rows } = await context.execute('data.read', {
      seriesId: 'main',
      from: Math.floor(from * 1000),
      to: Math.ceil(to * 1000),
      limit: 2000,
    });
    const last = rows.at(-1);
    return { close: typeof last?.close === 'number' ? last.close : null };
  },
});

export const markEarnings = defineCommand({
  name: 'acme.markEarnings',
  effect: 'mutation',
  description: 'Mark the next earnings date with a vertical line.',
  instructions: 'Use only when the user asks about earnings.',
  examples: [{ description: 'Apple', input: { symbol: 'AAPL' } }],
  input: { symbol: field.string(16).describe('Ticker symbol, for example AAPL.') },
  output: { drawingId: field.string(64).describe('ID of the created line.') },
  async execute({ symbol }, context) {
    const time = await fetchNextEarnings(symbol, context.signal);
    const receipt = await context.execute('drawings.apply', {
      operations: [{ action: 'create', type: 'vertical_line', points: [{ time }] }],
    });
    return { drawingId: receipt.ids[0]! };
  },
});

export const annotate = defineCommand({
  name: 'acme.annotate',
  effect: 'mutation',
  description: 'Add price annotations.',
  examples: [{ description: 'One level', input: { marks: [{ kind: 'level', price: 182.5 }] } }],
  input: {
    marks: field.array(field.union('kind', {
      level: { price: field.number().describe('Price of the level.') },
      zone: {
        from: field.number().describe('Lower price.'),
        to: field.number().describe('Upper price.'),
        label: field.optional(field.string(32)).describe('Short label.'),
      },
    }).describe('One annotation.'), { maxItems: 10 }).describe('Annotations to add.'),
  },
  output: { added: field.integer({ minimum: 0 }).describe('Annotations added.') },
  async execute({ marks }, context) {
    // The handler receives a discriminated union: `from`/`to` exist only on zones.
    const prices = marks.flatMap(mark => (mark.kind === 'level' ? [mark.price] : [mark.from, mark.to]));
    const receipt = await context.execute('drawings.apply', {
      operations: prices.map(price => ({ action: 'create' as const, type: 'horizontal_line' as const, points: [{ price }] })),
    });
    return { added: receipt.ids.length };
  },
});

const confirmMutations: AutomationToolMiddleware = async (call, next) => {
  if (call.tool.effect === 'mutation' && !(await askUser(`Allow ${call.tool.name}?`))) throw new ChartCommandError('cancelled');
  return next();
};

export async function quickstart(chart: ChartWithAutomation) {
  const sdk = await chart.openAutomation({
    policy: { effects: ['read', 'mutation'] },
    async persist(change, context) {
      await saveDocument(change.family, change.prepared.document, { operationId: context.requestId, signal: context.signal });
    },
  });
  await sdk.drawings.apply({ operations: [{ action: 'create', type: 'horizontal_line', points: [{ price: 182.5 }] }] });
  sdk.extensions.register(lastVisibleClose(chart));
  sdk.extensions.register(markEarnings);
  sdk.extensions.register(annotate);
  const tools = createAutomationTools(sdk, { use: [confirmMutations] });
  return { sdk, tools, system: sdk.instructions() };
}

/** Browser half of a server-side model. */
export function serveToServer(sdk: ChartAutomation) {
  const server = serveAutomation(sdk, { captureResult: async capture => ({ attachmentId: await upload(capture.blob) }) });
  channel.onCall(async (call, signal) => channel.reply(await server.handle(call, signal)));
  return server.snapshot();
}

/** Server half: the same tools over the channel. */
export function serverTools(snapshot: ReturnType<typeof serveToServer>) {
  const chart = connectAutomation(snapshot, { send: (call, signal) => channel.call(call, signal) });
  return { tools: createAutomationTools(chart, { imageResult: value => value }), system: chart.instructions() };
}
