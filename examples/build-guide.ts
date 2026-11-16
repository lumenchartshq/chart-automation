import {
  connectAutomation, createAutomationTools,
  type AutomationCapture, type AutomationRemoteCall, type AutomationRemoteResult, type AutomationSnapshot,
  type AutomationTool, type AutomationToolSource, type ChartAutomation,
} from '../src/sdk/index.js';

/**
 * Compiled mirror of the "Build an integration" guide. The model client and
 * the channel are declared, not implemented: they belong to the integrator.
 */

// --- Your model provider (declared) -----------------------------------------
/** One tool in the provider's request format: JSON Schema function tools. */
interface ProviderTool { name: string; description: string; parameters: Readonly<Record<string, unknown>> }
/** A tool call as the model returned it: arguments are JSON text. */
interface ModelToolCall { id: string; name: string; arguments: string }
type ToolOutput = { kind: 'json'; text: string } | { kind: 'image'; mediaType: 'image/png'; base64: string };
type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ModelToolCall[] }
  | { role: 'tool'; toolCallId: string; output: ToolOutput };
interface ModelReply { text: string; toolCalls: ModelToolCall[] }
declare function callModel(request: { system: string; messages: readonly Message[]; tools: readonly ProviderTool[] }): Promise<ModelReply>;
declare function blobToBase64(blob: Blob): Promise<string>;

// --- Tools, rebuilt when the session's revision changes ---------------------
const toProviderTool = (tool: AutomationTool): ProviderTool => ({ name: tool.name, description: tool.description, parameters: tool.parameters });

/** Keeps a tool list that follows `capabilities().revision`. */
export function toolCatalog<C>(sdk: AutomationToolSource<C>, imageResult?: (capture: C) => Promise<ToolOutput>) {
  let revision = -1;
  let tools: AutomationTool[] = [];
  let byName = new Map<string, AutomationTool>();
  return () => {
    const current = sdk.capabilities().revision;
    if (current !== revision) {
      tools = createAutomationTools(sdk, imageResult ? { imageResult } : {});
      byName = new Map(tools.map(tool => [tool.name, tool]));
      revision = current;
    }
    return { tools, byName };
  };
}

const pngOutput = async (capture: AutomationCapture): Promise<ToolOutput> =>
  ({ kind: 'image', mediaType: 'image/png', base64: await blobToBase64(capture.blob) });

// --- One model call's tool calls --------------------------------------------
const INVALID_JSON = Symbol('invalid JSON');
function parseArguments(text: string): unknown {
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return INVALID_JSON; }
}

const isToolOutput = (value: unknown): value is ToolOutput =>
  !!value && typeof value === 'object' && 'kind' in value && (value.kind === 'json' || value.kind === 'image');

function serialize(result: unknown): ToolOutput {
  if (isToolOutput(result)) return result;
  return { kind: 'json', text: JSON.stringify(result ?? null) };
}

/** Runs `shared` calls together and each `exclusive` call alone, in the model's order. */
export async function runToolCalls(calls: readonly ModelToolCall[], byName: ReadonlyMap<string, AutomationTool>): Promise<Message[]> {
  const results = new Map<string, unknown>();
  let shared: Promise<void>[] = [];
  for (const call of calls) {
    const tool = byName.get(call.name);
    const input = parseArguments(call.arguments);
    if (!tool) { results.set(call.id, { error: 'unsupported' }); continue; }
    if (input === INVALID_JSON) { results.set(call.id, { error: 'invalid_input' }); continue; }
    if (tool.concurrency === 'shared') {
      shared.push(tool.execute(call.id, input).then(result => { results.set(call.id, result); }));
      continue;
    }
    await Promise.all(shared);
    shared = [];
    results.set(call.id, await tool.execute(call.id, input));
  }
  await Promise.all(shared);
  return calls.map(call => ({ role: 'tool', toolCallId: call.id, output: serialize(results.get(call.id)) }));
}

// --- The loop ----------------------------------------------------------------
const MAX_STEPS = 8;

export async function runTurn<C>(
  sdk: AutomationToolSource<C> & { instructions(): string },
  catalog: ReturnType<typeof toolCatalog<C>>,
  messages: Message[],
): Promise<string> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const { tools, byName } = catalog();
    const reply = await callModel({ system: sdk.instructions(), messages, tools: tools.map(toProviderTool) });
    messages.push({ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls });
    if (!reply.toolCalls.length) return reply.text;
    messages.push(...await runToolCalls(reply.toolCalls, byName));
  }
  return 'Stopped after the step limit.';
}

// --- Model in the page -------------------------------------------------------
interface ChartWithAutomation {
  openAutomation(options?: { policy?: { effects?: readonly ('read' | 'mutation' | 'external')[]; commands?: readonly string[] } }): Promise<ChartAutomation>;
}

export async function startLocal(chart: ChartWithAutomation, question: string) {
  const sdk = await chart.openAutomation({
    policy: {
      effects: ['read', 'mutation'],
      commands: ['data.read', 'capture.image', 'capabilities.query', 'drawings.context', 'drawings.list', 'drawings.apply'],
    },
  });
  const catalog = toolCatalog(sdk, pngOutput);
  const messages: Message[] = [{ role: 'user', text: question }];
  const answer = await runTurn(sdk, catalog, messages);
  return { sdk, answer };
}

/** On view teardown. `close()` rethrows the first cleanup failure after running every cleanup step. */
export function stopLocal(sdk: ChartAutomation) {
  try { sdk.close(); } catch (error) { console.warn('Automation cleanup failed', error); }
}

// --- Model on your server ----------------------------------------------------
declare const channel: {
  call(call: AutomationRemoteCall, signal: AbortSignal): Promise<AutomationRemoteResult>;
  /** Snapshots the browser pushes when its revision changes; returns an unsubscribe function. */
  onSnapshot(listener: (snapshot: AutomationSnapshot) => void): () => void;
};

export async function serverTurn(snapshot: AutomationSnapshot, messages: Message[]) {
  const chart = connectAutomation(snapshot, { send: (call, signal) => channel.call(call, signal) });
  const stopSnapshots = channel.onSnapshot(next => chart.update(next));
  // On the server, a capture resolves to whatever the browser's `captureResult` returned.
  const catalog = toolCatalog(chart, async value => ({ kind: 'json', text: JSON.stringify(value) }));
  try {
    return await runTurn(chart, catalog, messages);
  } finally {
    stopSnapshots();
    chart.close();
  }
}
