import { ChartCommandError, epochSecondsRangeToMilliseconds } from '../src/core-contracts/index.js';
import { createNativeChartAutomation, createAutomationTools, defineCommand, field, type NativeAutomationChart } from '../src/sdk/index.js';

/** Bundle this example with your own application; no application endpoint is used. */
export function standaloneAutomation(chart: NativeAutomationChart, capturePng: () => Promise<string>) {
  const sdk = createNativeChartAutomation({ chartId: 'primary', chart, capturePng });
  const registration = sdk.extensions.register(defineCommand({
    name: 'example.range',
    effect: 'read',
    description: 'Return the current visible chart time range in milliseconds.',
    input: {},
    output: { from: field.number(), to: field.number() },
    execute() {
      const range = epochSecondsRangeToMilliseconds(chart.getVisibleRange());
      if (!range) throw new ChartCommandError('missing_history');
      return range;
    },
  }));
  return {
    sdk,
    range: () => registration.execute({}),
    capture: () => sdk.capture.image(),
    // Forward these schemas/executors to your chosen model or RPC implementation.
    // Supply imageResult if your integration supports image uploads/attachments.
    tools: createAutomationTools(sdk, requestId => sdk.request({ requestId })),
    destroy: () => { registration(); sdk.destroy(); },
  };
}
