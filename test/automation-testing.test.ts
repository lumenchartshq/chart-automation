import { describe, expect, it, vi } from 'vitest';
import { createFakeDrawingOwner, createTestAutomation } from '../src/sdk/testing.js';
import { ChartCommandError, createAutomationTools, defineCommand, field } from '../src/sdk/index.js';

it('lets integrators test commands, fencing and tools without a widget', async () => {
  const { sdk, select, setRows, remove } = createTestAutomation({ rows: { main: [{ time: 1, open: 1, high: 2, low: 1, close: 2 }] } });
  const last = sdk.extensions.register(defineCommand({
    name: 'acme.lastClose', effect: 'read', description: 'Latest loaded close.',
    input: {}, output: { close: field.nullable(field.number()) },
    async execute(_input, context) {
      const result = await context.execute('data.read', { seriesId: 'main', from: 0, to: Date.now(), limit: 1000 });
      const row = result.rows.at(-1) as { close?: number } | undefined;
      return { close: row?.close ?? null };
    },
  }));
  expect(await last.execute({})).toEqual({ close: 2 });
  setRows('main', [{ time: 1, open: 1, high: 3, low: 1, close: 3 }]);
  expect(await last.execute({})).toEqual({ close: 3 });

  const stale = sdk.request();
  select();
  await expect(last.execute({}, stale)).rejects.toMatchObject({ code: 'stale_binding' });

  const tools = createAutomationTools(sdk, { imageResult: capture => ({ bytes: capture.blob.size }) });
  expect(tools.map(tool => tool.name)).toEqual(['acme_last_close', 'data_series', 'data_read', 'capture_image']);
  expect(await tools.find(tool => tool.name === 'capture_image')!.execute('shot', {})).toMatchObject({ bytes: expect.any(Number) });

  remove();
  expect(() => sdk.capabilities()).toThrow('unavailable');
});

it('runs SDK ports as children without a second concurrency slot and within effect rules', async () => {
  const { sdk } = createTestAutomation({ policy: { maxConcurrent: 1 }, rows: { main: [{ time: 5, open: 1, high: 1, low: 1, close: 1 }] } });
  sdk.extensions.register(defineCommand({
    name: 'acme.summary', effect: 'read', description: 'Rows and series.',
    input: {}, output: { rows: field.integer({ minimum: 0 }), series: field.integer({ minimum: 0 }), png: field.boolean() },
    async execute(_input, context) {
      const [series, read, image] = [await context.execute('data.series'), await context.execute('data.read', { seriesId: 'main', from: 0, to: 10, limit: 10 }), await context.execute('capture.image')];
      return { rows: read.rows.length, series: series.length, png: image.blob.type === 'image/png' };
    },
  }));
  expect(await sdk.execute('acme.summary', {})).toEqual({ rows: 1, series: 1, png: true });
  sdk.extensions.register(defineCommand({
    name: 'acme.fetch', effect: 'read', description: 'Tries an external port.',
    input: {}, output: {},
    async execute(_input, context) { await context.execute('data.requestHistory', { seriesId: 'main', from: 0, to: 1, limit: 1 }); return {}; },
  }));
  await expect(sdk.execute('acme.fetch', {})).rejects.toThrow('cannot run data.requestHistory');
  sdk.destroy();
});

describe('markEarnings with native stubs', () => {
  const EARNINGS = Date.UTC(2026, 0, 29);
  /** The docs' `markEarnings` command, with the earnings lookup injected. */
  const markEarnings = (fetchNextEarnings: (symbol: string, signal: AbortSignal) => Promise<number>) => defineCommand({
    name: 'acme.markEarnings',
    effect: 'mutation',
    description: 'Mark the next earnings date with a vertical line.',
    instructions: 'Use only when the user asks about earnings.',
    examples: [{ description: 'Apple', input: { symbol: 'AAPL' } }],
    input: { symbol: field.string(16) },
    output: { drawingId: field.string(64) },
    async execute({ symbol }, context) {
      const time = await fetchNextEarnings(symbol, context.signal);
      const receipt = await context.execute('drawings.apply', {
        operations: [{ action: 'create', type: 'vertical_line', points: [{ time }] }],
      });
      return { drawingId: receipt.ids[0]! };
    },
  });
  const policy = { effects: ['read', 'mutation'] as const };
  const page = { offset: 0, limit: 10 };

  it('saves through persist under a lease, then applies with native Undo', async () => {
    const drawings = createFakeDrawingOwner({ binding: { symbol: { ticker: 'AAPL' } } });
    const saved: { family: string; count: number; leased: boolean; visible: number; requestId: string }[] = [];
    const { sdk } = createTestAutomation({
      policy,
      owners: {
        drawings,
        async persist(change, context) {
          const payload = change.prepared.document.payload as { drawings: unknown[] };
          saved.push({ family: change.family, count: payload.drawings.length, leased: drawings.leased(), visible: drawings.list(page).total, requestId: context.requestId });
        },
      },
    });
    const command = sdk.extensions.register(markEarnings(async () => EARNINGS));
    expect(sdk.instructions()).toContain('earnings');

    const { drawingId } = await command.execute({ symbol: 'AAPL' });
    // Saved before it appeared, while manual edits were blocked.
    expect(saved).toEqual([{ family: 'drawings', count: 1, leased: true, visible: 0, requestId: expect.any(String) }]);
    expect(drawings.leased()).toBe(false);
    const listed = await sdk.drawings.list(page);
    expect(listed.drawings).toMatchObject([{ id: drawingId, type: 'vertical_line', points: [{ time: EARNINGS }] }]);
    expect((await sdk.drawings.context()).binding).toMatchObject({ symbol: { ticker: 'AAPL' }, revision: 1 });
    const operationId = saved[0]!.requestId;
    expect(drawings.isNextUndo(operationId)).toBe(true);
    expect(drawings.undo(operationId)).toBe(true);
    expect((await sdk.drawings.list(page)).total).toBe(0);
  });

  it('applies nothing when persist rejects', async () => {
    const drawings = createFakeDrawingOwner();
    const { sdk } = createTestAutomation({ policy, owners: { drawings, persist: async () => { throw new ChartCommandError('persistence_unresolved'); } } });
    const command = sdk.extensions.register(markEarnings(async () => EARNINGS));
    await expect(command.execute({ symbol: 'AAPL' })).rejects.toMatchObject({ code: 'persistence_unresolved' });
    expect(drawings.list(page).total).toBe(0);
    expect(drawings.leased()).toBe(false);
  });

  it('rejects a stale target before and during the earnings lookup without saving or drawing', async () => {
    const drawings = createFakeDrawingOwner();
    const persist = vi.fn(async () => {});
    const { sdk, select } = createTestAutomation({ policy, owners: { drawings, persist } });
    let release!: () => void;
    const lookup = new Promise<void>(resolve => { release = resolve; });
    const command = sdk.extensions.register(markEarnings(async () => { await lookup; return EARNINGS; }));

    const earlier = sdk.request();
    select();
    await expect(command.execute({ symbol: 'AAPL' }, earlier)).rejects.toMatchObject({ code: 'stale_binding' });

    const running = command.execute({ symbol: 'AAPL' });
    await new Promise(resolve => setTimeout(resolve, 0));
    select(); // the user switches symbol while the lookup is in flight
    release();
    await expect(running).rejects.toMatchObject({ code: 'stale_binding' });
    expect(persist).not.toHaveBeenCalled();
    expect(drawings.list(page).total).toBe(0);
  });

  it('serves native drawing tools and shares one Undo history with manual edits', async () => {
    const drawings = createFakeDrawingOwner();
    const applied: string[] = [];
    const { sdk } = createTestAutomation({ policy, owners: { drawings, persist: async (_change, context) => { applied.push(context.requestId); } } });
    sdk.extensions.register(markEarnings(async () => EARNINGS));
    const tools = createAutomationTools(sdk);
    const tool = (name: string) => tools.find(entry => entry.name === name)!;
    expect(tools.map(entry => entry.name)).toEqual(expect.arrayContaining(['acme_mark_earnings', 'drawings_apply', 'drawings_list', 'drawings_context', 'capabilities_query']));

    drawings.manualEdit('by-hand', entries => [...entries, { id: 'manual', type: 'horizontal_line', points: [{ price: 1 }], locked: false, selected: false, editable: true }]);
    const { drawingId } = await tool('acme_mark_earnings').execute('call-1', { symbol: 'AAPL' }) as { drawingId: string };
    expect(await tool('drawings_list').execute('call-2', page)).toMatchObject({ total: 2 });
    expect(await tool('drawings_apply').execute('call-3', { operations: [{ action: 'delete', id: 'missing' }] })).toEqual({ error: 'ambiguous_target' });

    expect(drawings.undo(applied[0]!)).toBe(true);
    expect(drawings.list(page).drawings.map(entry => entry.id)).toEqual(['manual']);
    expect(drawings.isNextUndo('by-hand')).toBe(true);
    expect(drawingId).toMatch(/^drawing-/);
  });
});
