import type { ChartAutomation } from './chart-automation.js';
import { createNativeChartAutomation } from './native-chart.js';
import { installNativeAutomationCommands, type NativeCommandOwners } from './native-commands.js';

export type NativeChartAutomationOptions = Parameters<typeof createNativeChartAutomation>[0] & {
  /** Native command owners for this chart; omitted families stay `unsupported`. */
  owners?: NativeCommandOwners;
};

/** A native session with its native commands installed; installation failure destroys the session. */
export function openNativeChartAutomation(options: NativeChartAutomationOptions): ChartAutomation {
  const { owners, ...native } = options;
  const sdk = createNativeChartAutomation(native);
  if (!owners) return sdk;
  try {
    installNativeAutomationCommands(sdk, owners);
  } catch (error) {
    try { sdk.destroy(); } catch { /* Preserve the installation failure. */ }
    throw error;
  }
  return sdk;
}
