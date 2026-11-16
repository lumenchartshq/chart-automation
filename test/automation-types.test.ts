import { expect, expectTypeOf, it } from 'vitest';
import { createChartAutomation, type ChartAutomation } from '../src/sdk/index.js';
import type { ChartContext, DrawingOperation, DrawingReceipt, DrawingSummary } from '../src/contracts.js';
import type { ChartStudyContext, StudyList, StudyReceipt } from '../src/studies.js';
import type { ChartSettingsReceipt } from '../src/chart-settings.js';
import type { InspectedChart } from '../src/capabilities.js';
import type { WorkspaceContext, WorkspaceDocument } from '../src/workspace.js';

it('exposes concrete built-in return and input contracts', () => {
  expectTypeOf<ReturnType<ChartAutomation['drawings']['context']>>().toEqualTypeOf<Promise<ChartContext>>();
  expectTypeOf<ReturnType<ChartAutomation['drawings']['list']>>().toEqualTypeOf<Promise<{ drawings: DrawingSummary[]; total: number }>>();
  expectTypeOf<ReturnType<ChartAutomation['drawings']['apply']>>().toEqualTypeOf<Promise<DrawingReceipt>>();
  expectTypeOf<Parameters<ChartAutomation['drawings']['apply']>[0]>().toEqualTypeOf<{ operations: DrawingOperation[] }>();
  expectTypeOf<ReturnType<ChartAutomation['studies']['context']>>().toEqualTypeOf<Promise<ChartStudyContext>>();
  expectTypeOf<ReturnType<ChartAutomation['studies']['list']>>().toEqualTypeOf<Promise<StudyList>>();
  expectTypeOf<ReturnType<ChartAutomation['studies']['apply']>>().toEqualTypeOf<Promise<StudyReceipt>>();
  expectTypeOf<ReturnType<ChartAutomation['settings']['inspect']>>().toEqualTypeOf<Promise<InspectedChart>>();
  expectTypeOf<ReturnType<ChartAutomation['settings']['apply']>>().toEqualTypeOf<Promise<ChartSettingsReceipt>>();
  expectTypeOf<ReturnType<ChartAutomation['workspace']['context']>>().toEqualTypeOf<Promise<WorkspaceContext>>();
  expectTypeOf<ReturnType<ChartAutomation['workspace']['apply']>>().toEqualTypeOf<Promise<WorkspaceDocument>>();
});

it.each(['drawings.apply', 'studies.list', 'settings.inspect', 'workspace.apply', 'capabilities.query'])('reserves native command %s against incompatible extensions', name => {
  const sdk = createChartAutomation({ currentTarget: () => ({ id: 'chart', generation: 0 }) });
  const schema = { jsonSchema: { type: 'number' }, parse: () => 1 };
  expect(() => sdk.extensions.register({ name, version: 1, description: 'Incorrect native replacement', effect: 'read', input: schema, output: schema, execute: () => 1 })).toThrow('invalid_input');
  sdk.destroy();
});
