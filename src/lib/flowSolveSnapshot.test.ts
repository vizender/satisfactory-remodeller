import { expect, it } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { computeFlowSolveSnapshot } from "@/lib/flowSolveSnapshot";

it("shares one calculation across subscribers and recalculates when a forced rate changes", () => {
  const nodes: Node[] = [
    {
      id: "m",
      type: "machineFrame",
      position: { x: 0, y: 0 },
      data: { clockPercent: 100 },
    },
    {
      id: "m-out",
      parentId: "m",
      type: "itemPort",
      position: { x: 0, y: 0 },
      data: { kind: "out", perMinute: 30, itemId: "iron" },
    },
  ];
  const edges: Edge[] = [];
  const forced = { "m-out": 60 };
  const first = computeFlowSolveSnapshot(nodes, edges, forced);
  expect(computeFlowSolveSnapshot(nodes, edges, forced)).toBe(first);
  const next = computeFlowSolveSnapshot(nodes, edges, { "m-out": 90 });
  expect(next.effectiveRate["m-out"]).toBeCloseTo(90);
  expect(next).not.toBe(first);
  const stopped = nodes.map((n) =>
    n.id === "m" ? { ...n, data: { ...n.data, clockPercent: 0 } } : n,
  );
  expect(computeFlowSolveSnapshot(stopped, edges, forced).hardConflict).toBe(
    true,
  );
});
