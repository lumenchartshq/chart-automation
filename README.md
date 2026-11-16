# Lumen Charts automation

The automation SDK for [Lumen Charts](https://lumencharts.com): typed chart
commands, JSON Schemas and model tools, so your own code or an AI assistant can
read and change a chart.

| Entry point | Use it for |
| --- | --- |
| `@lumencharts/chart-automation/sdk` | Sessions, built-in commands, `defineCommand` and `field` schemas, model tools and the remote transport. |
| `@lumencharts/chart-automation/sdk/testing` | `createTestAutomation` and fakes for testing your own commands. |
| `@lumencharts/chart-automation/contracts` | Chart documents, bindings, time ranges and error codes shared by the SDK and the chart. |
| `@lumencharts/chart-automation` | Native operation validators and capability contracts. |

The SDK is open source under the Apache License 2.0. Lumen Charts itself is a
separate, commercially licensed charting library; the SDK drives it through the
chart's `openAutomation()` API.

## Install

```bash
npm install @lumencharts/chart-automation
```

## Quickstart

Open a session for a chart, add your own command and hand the tools to your
model:

```ts
import { createAutomationTools, defineCommand, field } from '@lumencharts/chart-automation/sdk';

// Inside the widget's ready callback.
const sdk = await widget.activeChart().openAutomation({
  policy: { effects: ['read', 'mutation'] },
});

await sdk.drawings.apply({
  operations: [{ action: 'create', type: 'horizontal_line', points: [{ price: 182.5 }] }],
});

sdk.extensions.register(defineCommand({
  name: 'acme.lastClose',
  effect: 'read',
  description: 'Return the latest loaded close.',
  input: {},
  output: { close: field.nullable(field.number()) },
  async execute(_input, context) {
    const { rows } = await context.execute('data.read', { seriesId: 'main', from: 0, to: Date.now(), limit: 10_000 });
    return { close: (rows.at(-1) as { close?: number } | undefined)?.close ?? null };
  },
}));

const tools = createAutomationTools(sdk); // name, description, parameters, execute(toolCallId, input)
const system = sdk.instructions();        // guidance from registered commands
```

The [`examples`](examples) folder has a compiled
version of this quickstart, a remote (server-side model) setup and a standalone
session. The full guide is at
[docs.lumencharts.com](https://docs.lumencharts.com/charting-library/automation).

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to report issues and how
releases are made.

## License

[Apache License 2.0](LICENSE). "Lumen Charts" is a trademark and is not covered
by the license.
