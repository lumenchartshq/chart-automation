import { describe, it, expect } from "vitest";
import {
  validateOperations,
  validateDocument,
  LIMITS,
  ChartCommandError,
} from "../src/index";
describe("strict drawing protocol", () => {
  it("keeps ellipse anchors negotiated and only advertises native width/fill/label styles", () => {
    const operation = {
      action: "create",
      type: "ellipse",
      points: [
        { time: 1700000000000, price: 10 },
        { time: 1700000060000, price: 20 },
        { time: 1700000030000, price: 22 },
      ],
      style: { text: "Area", fillOpacity: 0.25 },
    };
    expect(() => validateOperations([operation])).toThrow("unsupported");
    expect(validateOperations([operation], 2)).toEqual([operation]);
    expect(() =>
      validateOperations([{ ...operation, style: { lineStyle: "dashed" } }], 2),
    ).toThrow("unsupported");
  });
  it("keeps arrows negotiated and rejects unsupported fill styles", () => {
    const operation = {
      action: "create",
      type: "arrow",
      points: [
        { time: 1700000000000, price: 10 },
        { time: 1700000060000, price: 20 },
      ],
      style: { text: "Direction" },
    };
    expect(() => validateOperations([operation])).toThrow("unsupported");
    expect(validateOperations([operation], 2)).toEqual([operation]);
    expect(() =>
      validateOperations([{ ...operation, style: { fillOpacity: 0.5 } }], 2),
    ).toThrow("unsupported");
  });
  it("allows three channel anchors only under v2 and rejects oversized or arbitrary styles", () => {
    const operation = {
      action: "create",
      type: "parallel_channel",
      points: [
        { time: 1700000000000, price: 10 },
        { time: 1700000060000, price: 20 },
        { time: 1700000030000, price: 22 },
      ],
    };
    expect(() => validateOperations([operation])).toThrow("unsupported");
    expect(validateOperations([operation], 2)).toEqual([operation]);
    expect(() =>
      validateOperations(
        [{ ...operation, points: [...operation.points, operation.points[0]] }],
        2,
      ),
    ).toThrow("invalid_input");
    expect(() =>
      validateOperations([{ ...operation, style: { text: "unknown" } }], 2),
    ).toThrow("unsupported");
  });
  it("keeps Fibonacci behind catalog v2 with typed bounded native styles", () => {
    const operation = {
      action: "create",
      type: "fib_retracement",
      points: [
        { time: 1700000000000, price: 10 },
        { time: 1700000060000, price: 20 },
      ],
      style: { lineWidth: 3, lineStyle: "dashed", fillOpacity: 0.25 },
    };
    expect(() => validateOperations([operation])).toThrow("unsupported");
    expect(validateOperations([operation], 2)).toEqual([operation]);
    expect(() =>
      validateOperations([{ ...operation, style: { text: "unsupported" } }], 2),
    ).toThrow("unsupported");
  });
  it("rejects arbitrary properties, unsafe numbers, unsupported types and oversized batches", () => {
    for (const operations of [
      [{ action: "create", type: "javascript", points: [{ price: 1 }] }],
      [{ action: "delete", id: "x", callback: "url" }],
      [
        {
          action: "create",
          type: "horizontal_line",
          points: [{ price: Infinity }],
        },
      ],
      Array.from({ length: 26 }, () => ({ action: "delete", id: "x" })),
    ])
      expect(() => validateOperations(operations)).toThrow(ChartCommandError);
  });
  it("preserves sparse anchors and rejects oversized documents", () => {
    expect(
      validateOperations([
        {
          action: "create",
          type: "vertical_line",
          points: [{ time: 1700000000000 }],
        },
      ])[0],
    ).toHaveProperty("points", [{ time: 1700000000000 }]);
    expect(() =>
      validateDocument({
        version: 1,
        documentId: "doc",
        revision: 0,
        payload: { text: "x".repeat(LIMITS.documentBytes) },
      }),
    ).toThrow(ChartCommandError);
  });
  it("requires catalog negotiation and bounded exact group targets with explicit lock intent", () => {
    const operation = {
      action: "group.create",
      name: "Levels",
      ids: ["one", "two"],
    };
    expect(() => validateOperations([operation])).toThrow("unsupported");
    expect(validateOperations([operation], 2)).toEqual([operation]);
    for (const invalid of [
      { ...operation, ids: ["one"] },
      { ...operation, ids: ["one", "one"] },
      { ...operation, name: " " },
      {
        ...operation,
        ids: Array.from({ length: 101 }, (_, index) => String(index)),
      },
      { action: "group.remove", id: "x", all: true },
      { action: "group.lock", id: "x", locked: false },
      {
        action: "group.lock",
        id: "x",
        locked: false,
        confirmUserIntent: false,
      },
      { action: "group.members", id: "x", add: ["a"], remove: ["a"] },
      { action: "group.members", id: "x" },
    ])
      expect(() => validateOperations([invalid], 2)).toThrow(ChartCommandError);
    expect(
      validateOperations(
        [
          {
            action: "group.lock",
            id: "x",
            locked: false,
            confirmUserIntent: true,
          },
        ],
        2,
      ),
    ).toHaveLength(1);
  });
});
