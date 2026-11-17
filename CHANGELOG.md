# Changelog

Each release of `@lumencharts/chart-automation` has a section here. The notes
for a version also appear on its GitHub release.

## 0.1.3

No code changes from 0.1.2. Security reports now go to
support@lumencharts.com; the address in earlier versions does not exist.

## 0.1.2

No code changes from 0.1.1. The README now has a quick start you can run
without a chart, a step-by-step guide to using the SDK with AI assistants,
usage examples and a summary of the commands, limits and error codes.

## 0.1.1

No code changes from 0.1.0. This version is published from the release
workflow with npm provenance, so you can check that the package was built
from the public repository. Upgrade at any time; nothing else changes.

## 0.1.0

First public release of the Lumen Charts automation SDK.

- Typed command sessions for a chart: drawings, studies, navigation, chart
  settings, workspace, data reads and capture, with an effect policy per
  session.
- `defineCommand` and `field` for your own commands, with JSON Schemas
  generated from the same definitions.
- `createAutomationTools` turns a session into model tools for an AI
  assistant, with instructions from the registered commands.
- `connectAutomation` and `serveAutomation` run a session for a model on your
  server.
- `@lumencharts/chart-automation/sdk/testing` provides `createTestAutomation`
  and fakes for testing your commands without a chart.
- `@lumencharts/chart-automation/contracts` holds the chart document, binding,
  time range and error types shared with the chart.
