<h1 align="center">Lumen Charts automation</h1>

<p align="center">
  <strong>Let code and AI assistants read and change a Lumen Charts chart</strong><br>
  Typed chart commands, JSON Schemas generated from the same definitions, and
  model tools with policies, confirmations and server-side sessions.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lumencharts/chart-automation"><img src="https://img.shields.io/npm/v/@lumencharts/chart-automation.svg?style=flat-square" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square" alt="License: Apache-2.0"></a>
  <a href="https://docs.lumencharts.com/charting-library/automation"><img src="https://img.shields.io/badge/docs-lumencharts-4f46e5.svg?style=flat-square" alt="Documentation"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> •
  <a href="#features">Features</a> •
  <a href="#use-with-ai-agents">AI agents</a> •
  <a href="#usage">Usage</a> •
  <a href="#api-coverage">API coverage</a> •
  <a href="#documentation">Docs</a> •
  <a href="#license">License</a>
</p>

## What is it?

`@lumencharts/chart-automation` is the automation SDK for
[Lumen Charts](https://lumencharts.com). It turns a chart into a session of
typed commands: read bars, capture the chart as a PNG, add and edit drawings,
add and configure indicators, change chart settings, and run commands you write
yourself. The same session becomes a list of model tools, so an AI assistant
can do what your code can, within the limits you set.

```ts
import { createAutomationTools } from '@lumencharts/chart-automation/sdk';

const sdk = await widget.activeChart().openAutomation({
  policy: { effects: ['read', 'mutation'] },
});

await sdk.drawings.apply({
  operations: [{ action: 'create', type: 'horizontal_line', points: [{ price: 182.5 }] }],
});

const tools = createAutomationTools(sdk); // hand these to your model
const system = sdk.instructions();        // and this to its system prompt
```

The SDK is open source under the Apache License 2.0. Lumen Charts itself is a
separate, commercially licensed charting library; the SDK drives it through the
chart's `openAutomation()` API, and every Lumen Charts build includes the
chart-side automation runtime.

## Why?

| You need | The SDK gives you |
| --- | --- |
| An assistant that can act on the chart, not just talk about it | Model tools for drawings, indicators, settings, data reads and capture |
| Your own chart actions for the model | `defineCommand` and `field`: one definition yields the JSON Schema, the parser and the TypeScript types |
| Control over what the model may do | Policies by effect and command name, middleware for confirmations, budgets and audit logs |
| Model credentials kept on the server | Remote sessions: the chart stays in the browser, the tools run on the server |
| Changes the user can trust | Native Undo, receipts, revision checks and fences against changes to the symbol or interval |
| Tests that do not need a browser | An in-memory test session and fakes for every port |

The SDK has no model client, prompts or conversation store. You choose the
provider, the transport, storage and access policy; the SDK supplies the chart
side.

## Quick start

### Install

```bash
npm install @lumencharts/chart-automation
```

The package is ESM only, with TypeScript declarations. It runs in current
browsers and in Node.js 20 or later.

| Entry point | Use it for |
| --- | --- |
| `@lumencharts/chart-automation/sdk` | Sessions, built-in commands, `defineCommand` and `field` schemas, model tools and the remote transport. |
| `@lumencharts/chart-automation/sdk/testing` | `createTestAutomation` and fakes for testing your own commands. |
| `@lumencharts/chart-automation/contracts` | Chart documents, bindings, time ranges and error codes shared by the SDK and the chart. |
| `@lumencharts/chart-automation` | Native operation validators and capability contracts. |

### Hello world, without a chart

The test session runs the real command, schema and tool code over in-memory
bars, so you can try the SDK in Node.js before you wire up a chart:

```ts
import { createAutomationTools, defineCommand, field } from '@lumencharts/chart-automation/sdk';
import { createTestAutomation } from '@lumencharts/chart-automation/sdk/testing';

const { sdk } = createTestAutomation({
  rows: {
    main: [
      { time: 1_000, open: 1, high: 2, low: 1, close: 2 },
      { time: 2_000, open: 2, high: 3, low: 2, close: 2.5 },
    ],
  },
  policy: { effects: ['read'] },
});

sdk.extensions.register(defineCommand({
  name: 'acme.lastClose',
  effect: 'read',
  description: 'Return the latest loaded close.',
  input: {},
  output: { close: field.nullable(field.number()).describe('Latest close, or null when no bar is loaded.') },
  async execute(_input, context) {
    const { rows } = await context.execute('data.read', { seriesId: 'main', from: 0, to: 10_000, limit: 100 });
    const last = rows.at(-1);
    return { close: typeof last?.close === 'number' ? last.close : null };
  },
}));

const tools = createAutomationTools(sdk);
console.log(tools.map((tool) => tool.name)); // ['acme_last_close', 'data_series', 'data_read']

const lastClose = tools.find((tool) => tool.name === 'acme_last_close')!;
console.log(await lastClose.execute('call-1', {}));           // { close: 2.5 }
console.log(await lastClose.execute('call-2', { extra: 1 })); // { error: 'invalid_input', details: { reason: 'unknown field' } }
```

### On a chart

In the browser, open a session from the chart once the widget is ready.
`openAutomation` loads the chart's automation runtime on first use and
installs the native drawing, study and settings commands:

```ts
widget.onChartReady(async () => {
  const sdk = await widget.activeChart().openAutomation({
    policy: { effects: ['read', 'mutation'] },
  });
  console.log(sdk.capabilities().commands.map((command) => command.name));
  // When the view goes away (removing the chart also closes the session):
  // sdk.close();
});
```

Update the SDK and the chart together: the chart's type declarations name SDK
types through this package.

## Features

- **Native chart commands**: drawings (create, update, delete, group, lock),
  indicators (add, update, remove, comparisons) and chart settings, with native
  Undo and receipts.
- **Bounded reads and capture**: loaded bars by time window, and a PNG of the
  exact chart with its visible range and target.
- **Custom commands**: `defineCommand` with `field` builders for strings,
  numbers, enums, arrays, objects, discriminated unions and records.
- **Model tools**: one tool per permitted command, with snake_case names,
  JSON Schema parameters, examples, effects and a concurrency hint.
- **Policies**: allow effects (`read`, `mutation`, `external`) and exact
  command names; cap concurrency, deadlines and message size.
- **Middleware**: wrap every tool call for confirmations, budgets, logging or
  result shaping.
- **Server-side models**: `serveAutomation` in the browser and
  `connectAutomation` on the server, over any transport you choose.
- **Safe failures**: every failure is one of 14 error codes with an optional
  field path, never a message or an input value.
- **Fences**: requests are bound to the chart they were built for and reject
  with `stale_binding` once the symbol, interval or chart changes.
- **Testing**: `createTestAutomation` and a fake drawing owner for unit tests.

## Use with AI agents

This is what the SDK is for. A model sees the chart through tools, and every
tool call goes through the same policy, schema and fence checks as a call from
your own code.

### 1. Open a session with least privilege

Pass an explicit policy. Without one every effect is allowed, including
`external`.

```ts
const sdk = await chart.openAutomation({
  commands: ['drawings'],
  policy: {
    effects: ['read', 'mutation'],
    commands: ['data.read', 'capture.image', 'capabilities.query',
      'drawings.context', 'drawings.list', 'drawings.inspect', 'drawings.apply'],
    maxConcurrent: 4,
    deadlineMs: 15_000,
  },
});
```

Anything the policy leaves out is missing from `capabilities()`, from
`instructions()` and from the tool list, and calling it rejects with
`unsupported`.

### 2. Build the tools

```ts
import { ChartCommandError, createAutomationTools, type AutomationToolMiddleware } from '@lumencharts/chart-automation/sdk';

const confirmMutations: AutomationToolMiddleware = async (call, next) => {
  if (call.tool.effect === 'mutation' && !(await askUser(`Allow ${call.tool.name}?`))) {
    throw new ChartCommandError('cancelled');
  }
  return next();
};

const tools = createAutomationTools(sdk, {
  use: [confirmMutations],                                 // outermost first
  imageResult: async (capture) => toProviderImage(capture.blob), // enables capture_image
});
const system = sdk.instructions();
```

Each tool has `name`, `commandName`, `description`, `parameters` (JSON
Schema), `effect`, `concurrency` and `execute(toolCallId, input)`. Translate
them into your provider's tool format. Other options rename tools
(`toolPrefix`, `toolNames`), filter them (`include`), replace descriptions
you have evaluated (`describe`) and shape errors (`errorResult`).

### 3. Run the model's tool calls

When a model asks for several calls at once, run `shared` calls together and
each `exclusive` call alone, in the model's order:

```ts
import type { AutomationTool } from '@lumencharts/chart-automation/sdk';

async function runToolCalls(calls: readonly { id: string; name: string; input: unknown }[], tools: readonly AutomationTool[]) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const results = new Map<string, unknown>();
  let shared: Promise<void>[] = [];
  for (const call of calls) {
    const tool = byName.get(call.name);
    if (!tool) { results.set(call.id, { error: 'unsupported' }); continue; }
    if (tool.concurrency === 'shared') {
      shared.push(tool.execute(call.id, call.input).then((result) => { results.set(call.id, result); }));
      continue;
    }
    await Promise.all(shared);
    shared = [];
    results.set(call.id, await tool.execute(call.id, call.input));
  }
  await Promise.all(shared);
  return calls.map((call) => ({ toolCallId: call.id, result: results.get(call.id) }));
}
```

A failed call resolves to `{ error: code, details? }` rather than throwing, so
the model can read it and correct itself: `invalid_input` with
`details.path` names the field to fix, `stale_binding` means "read the chart
again", `busy` means "try again shortly". Tool lists are snapshots: rebuild
them when `sdk.capabilities().revision` changes.

### 4. Run the model on your server

Keep model credentials on the server. The browser serves the session, the
server connects to it over your own channel (WebSocket, HTTP, a queue) and
gets the same tools:

```ts
// Browser
import { serveAutomation } from '@lumencharts/chart-automation/sdk';

const server = serveAutomation(sdk, {
  captureResult: async (capture) => ({ attachmentId: await upload(capture.blob) }),
});
channel.onCall(async (call, signal) => channel.reply(await server.handle(call, signal)));
startTurn({ chart: server.snapshot() });
```

```ts
// Server
import { connectAutomation, createAutomationTools } from '@lumencharts/chart-automation/sdk';

const chart = connectAutomation(turn.chart, {
  send: (call, signal) => channel.call(call, signal),
});
const tools = createAutomationTools(chart, { use: [budgets, auditLog] });
const system = chart.instructions();
```

The browser's policy stays the authority: the server can only call what the
browser session permits, whatever its tool list says. The protocol is three
small JSON messages (snapshot, call, result), versioned and validated on both
sides. Your channel owns delivery, replay by request ID and cancellation.

### 5. Let users undo the assistant

Every applied drawing, indicator and settings change is a native Undo step, so
the user can press Undo on the chart. A drawing receipt's `operationId` is the
tool call ID, and a drawing owner you create yourself can undo exactly that
batch with `undo(operationId)` while it is still the newest change.

### Security checklist

- **Model output is untrusted.** Schemas check that a call is well formed, not
  that the user wanted it. Confirm mutations and anything `external` in
  middleware.
- **Extensions are not sandboxed.** Register only code you ship; never register
  or evaluate code a model wrote.
- **Policy is not authorization.** Enforce accounts, plans and entitlements at
  your own server.
- **Errors are safe to show the model.** They carry a code and a field path,
  never messages or input values.
- **Reads stay local.** Only `data.requestHistory`, which needs the `external`
  effect and a provider you supply, reaches outside the page.

## Usage

### Read data and capture the chart

```ts
const range = chart.getVisibleRange(); // UTC seconds
const { rows, coverage } = await sdk.data.read({
  seriesId: 'main',
  from: Math.floor(range.from * 1000),
  to: Math.ceil(range.to * 1000),
  limit: 2_000,
});

const image = await sdk.capture.image();
console.log(image.blob, image.width, image.height, image.visibleRange);
```

Times are integer UTC milliseconds. A window holding more bars than `limit`
rejects with `limit_exceeded` instead of returning part of it, so read the
visible range or a short trailing window. Reads never fetch missing history.

### Draw on the chart

```ts
const receipt = await sdk.drawings.apply({
  operations: [
    { action: 'create', type: 'trend_line', ref: 'up',
      points: [{ time: 1735689600000, price: 180 }, { time: 1736294400000, price: 192 }],
      style: { color: '#2962ff', lineWidth: 2 } },
    { action: 'create', type: 'horizontal_line', ref: 'support', points: [{ price: 178.5 }] },
    { action: 'group.create', name: 'Breakout', ids: ['ref:up', 'ref:support'] },
  ],
});
console.log(receipt.ids, receipt.groupIds);
```

A batch of up to 25 operations applies as one Undo step, all or nothing.

### Add an indicator

```ts
const { revision } = await sdk.studies.context();
const receipt = await sdk.studies.apply({
  expectedRevision: revision,
  operations: [{
    action: 'add',
    studyId: 'Relative Strength Index@chart-studies-1',
    inputs: { length: 21 },
    placement: { paneId: 'new', scale: 'own' },
  }],
});
```

`expectedRevision` makes the batch reject with `stale_binding` if the
indicators changed since you read them. Field IDs for each indicator come from
`capabilities.query`.

### Change chart settings

```ts
await sdk.settings.apply({ settings: { chartType: 'line', 'scale.mode': 'log' } });
```

Settings apply to the open chart and are not saved, as with a change the user
makes by hand.

### Write your own commands

`field` declarations produce the JSON Schema the model sees and the parser the
SDK runs, and the handler's types are inferred from them. Commands can call
other commands and the data and capture ports through `context.execute`, inside
the same request, deadline and fence:

```ts
import { defineCommand, field } from '@lumencharts/chart-automation/sdk';

const markLevels = defineCommand({
  name: 'acme.markLevels',
  effect: 'mutation',
  description: 'Draw horizontal lines at the given prices.',
  instructions: 'Use for support and resistance levels the user asks for.',
  examples: [{ description: 'Two levels', input: { prices: [180, 192.5] } }],
  input: { prices: field.array(field.number().describe('Price of one level.'), { maxItems: 10 }).describe('Levels to draw.') },
  output: { drawingIds: field.array(field.string(64), { maxItems: 10 }).describe('IDs of the new lines.') },
  async execute({ prices }, context) {
    const receipt = await context.execute('drawings.apply', {
      operations: prices.map((price) => ({ action: 'create' as const, type: 'horizontal_line' as const, points: [{ price }] })),
    });
    return { drawingIds: receipt.ids };
  },
});

const registration = sdk.extensions.register(markLevels);
await registration.execute({ prices: [180] }); // call it from code too
registration();                                // unregister
```

A `read` command can never mutate or reach an external service, even through
`context.execute`. The namespaces `data`, `capture`, `sdk`, `drawings`,
`studies`, `settings`, `workspace` and `capabilities` are reserved.

### Save changes before they appear

```ts
const sdk = await chart.openAutomation({
  policy: { effects: ['read', 'mutation'] },
  async persist(change, context) {
    await saveDocument(change.family, change.prepared.document, { operationId: context.requestId, signal: context.signal });
  },
});
```

`persist` runs after a drawing or indicator change is prepared and before it
is committed. Reject to abort the change.

### Handle errors

```ts
import { chartCommandErrorCode } from '@lumencharts/chart-automation/contracts';

try {
  await sdk.drawings.apply({ operations });
} catch (error) {
  if (chartCommandErrorCode(error) === 'locked') askUserToUnlock();
  else throw error;
}
```

Read the code with `chartCommandErrorCode` rather than `instanceof`: the
chart's runtime is bundled separately from your copy of the SDK.

### Test your integration

```ts
import { createTestAutomation } from '@lumencharts/chart-automation/sdk/testing';

const { sdk, select } = createTestAutomation({
  rows: { main: [{ time: 1_000, open: 1, high: 2, low: 1, close: 2 }] },
});
const command = sdk.extensions.register(lastClose); // the command from the hello world above
const earlier = sdk.request();
select(); // simulate a symbol or interval change
await command.execute({}, earlier); // rejects with stale_binding
```

`setRows` replaces the loaded bars and `remove` simulates removing the chart.
Tools built from a test session use the same schema and error paths as on a
chart, so you can test middleware and your model loop with a scripted model.

## API coverage

### Built-in commands

| Command | Effect | What it does |
| --- | --- | --- |
| `capabilities.query` | read | Fields and choices for every drawing type, indicator and chart setting |
| `drawings.context` | read | Binding, visible range, selection, loaded coverage and the drawing catalogue |
| `drawings.list`, `drawings.groups`, `drawings.inspect` | read | Paged drawings and groups; one drawing's current values |
| `drawings.apply` | mutation | `create`, `update`, `delete` and `group.create`, `group.rename`, `group.members`, `group.visibility`, `group.lock`, `group.remove` |
| `studies.context`, `studies.list`, `studies.inspect` | read | Indicator revision, panes and limits; paged indicators; one indicator's values |
| `studies.apply` | mutation | `add`, `update`, `remove`, `add_comparison`, `remove_comparison` |
| `settings.inspect` | read | Chart type, price scale settings and available chart types |
| `settings.apply` | mutation | Chart type and price scale mode, inversion and auto-scale |

Drawing types: horizontal line, vertical line, trend line, ray, rectangle,
text, Fibonacci retracement, parallel channel, arrow and ellipse. The widget's
`ai_commands` option can switch families off for every session on a chart.

### Ports

| Port | Effect | Tool |
| --- | --- | --- |
| `data.series` | read | `data_series` |
| `data.read` | read | `data_read` |
| `data.requestHistory` | external | `data_request_history`, when the host supplies a history provider |
| `capture.image` | read | `capture_image`, when you supply `imageResult` |

### Field builders

`field.string`, `field.text`, `field.integer`, `field.number`,
`field.boolean`, `field.literal`, `field.oneOf`, `field.array`,
`field.object`, `field.union`, `field.record`, `field.scalar`,
`field.unknown`, `field.optional` and `field.nullable`, each with
`.describe(text)`.

### Limits

| Ceiling | Value |
| --- | --- |
| Concurrent requests | 32 (default 8) |
| Request deadline | 120 s (default 30 s) |
| Message size | 2 MiB (default 256 KiB) |
| Rows per read | 10,000 |
| Series and fields | 256 series, 128 fields each |
| Capture | 16 MiB, 4,096 px per side |

`AUTOMATION_CEILINGS` exports these values. Policies can lower the defaults,
never raise the ceilings.

### Error codes

`invalid_input`, `limit_exceeded`, `unsupported`, `stale_binding`, `busy`,
`locked`, `ambiguous_target`, `unavailable`, `expired`, `cancelled`,
`operation_conflict`, `revision_conflict`, `missing_history` and
`persistence_unresolved`. The [errors guide](https://docs.lumencharts.com/charting-library/automation/errors)
says when each occurs, whether to retry and what a model should do next.

## Documentation

The full guide is at
**[docs.lumencharts.com/charting-library/automation](https://docs.lumencharts.com/charting-library/automation)**.

| Task | Guide |
| --- | --- |
| Connect a model end to end | [Build an integration](https://docs.lumencharts.com/charting-library/automation/build-guide) |
| Choose command families and tool options | [Commands & model tools](https://docs.lumencharts.com/charting-library/automation/commands-and-tools) |
| Look up an operation, field or receipt | [Command reference](https://docs.lumencharts.com/charting-library/automation/reference) |
| Read bars and capture the chart | [Local data & capture](https://docs.lumencharts.com/charting-library/automation/data-and-capture) |
| Add your own commands, data and saves | [Custom commands & host ports](https://docs.lumencharts.com/charting-library/automation/extensions) |
| Call the model from your server | [Server-side models](https://docs.lumencharts.com/charting-library/automation/remote) |
| Limit what a model may do | [Policy, limits & security](https://docs.lumencharts.com/charting-library/automation/security) |
| Handle a failed call | [Errors & recovery](https://docs.lumencharts.com/charting-library/automation/errors) |
| Let users undo the assistant | [Undo assistant changes](https://docs.lumencharts.com/charting-library/automation/undo) |
| Unit-test commands and tools | [Test your integration](https://docs.lumencharts.com/charting-library/automation/testing) |

The [`examples`](examples) folder has compiled versions of the guide's code:
a complete model loop for the page and the server, the quickstart with custom
commands, and a standalone session.

## Use cases

**Chart assistants**

- Answer "what is the trend here?" from the visible bars and a capture.
- Draw levels, channels and annotations the user asks for, with an Undo button
  for the assistant's change.

**Workflow automation**

- Apply a saved analysis template: indicators, panes and drawings in one step.
- Mark events from your own data, such as earnings or fills, as drawings.

**Server-side agents**

- Keep model keys, budgets and audit logs on the server while the chart stays
  in the user's browser.

**Testing and QA**

- Unit-test commands, policies and your model loop without a browser.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Contributing

Bug reports and feature ideas are welcome as
[issues](https://github.com/lumenchartshq/chart-automation/issues). For a bug,
include the SDK and chart versions and a small example that reproduces it. We
are not accepting pull requests yet; [CONTRIBUTING.md](CONTRIBUTING.md)
explains how releases are made. Report security issues privately to
support@lumencharts.com.

## License

[Apache License 2.0](LICENSE). "Lumen Charts" is a trademark and is not covered
by the license.
