import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  collectVerticalSegments,
  detectIntersectionLocks,
  filterSegmentsToSameNetwork,
  fuseRouteOnRelease,
} from "@/lib/orthogonalEdgePath";
import { clearOrthoDragPreview, setOrthoDragPreview } from "@/lib/orthoDragPreview";

describe("same-network snap / kink near foreign crossings", () => {
  it("filterSegmentsToSameNetwork drops foreign feeds", () => {
    const edges: Edge[] = [
      { id: "a", source: "p1", target: "p2", data: { itemId: "w" } },
      { id: "b", source: "p2", target: "p3", data: { itemId: "w" } },
      { id: "c", source: "q1", target: "q2", data: { itemId: "p" } },
    ];
    const segs = [
      { edgeId: "b", x: 10 },
      { edgeId: "c", x: 20 },
    ];
    const kept = filterSegmentsToSameNetwork("a", segs, edges);
    expect(kept.map((s) => s.edgeId)).toEqual(["b"]);
  });

  it("detectIntersectionLocks ignores foreign-network verticals", () => {
    const nodes: Node[] = [
      { id: "f1", type: "machineFrame", position: { x: 0, y: 0 }, data: {} },
      {
        id: "a-out",
        type: "itemPort",
        parentId: "f1",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      { id: "f2", type: "machineFrame", position: { x: 300, y: 0 }, data: {} },
      {
        id: "a-in",
        type: "itemPort",
        parentId: "f2",
        position: { x: 0, y: 0 },
        data: { kind: "in" },
      },
      { id: "f3", type: "machineFrame", position: { x: 100, y: -50 }, data: {} },
      {
        id: "b-out",
        type: "itemPort",
        parentId: "f3",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      { id: "f4", type: "machineFrame", position: { x: 100, y: 250 }, data: {} },
      {
        id: "b-in",
        type: "itemPort",
        parentId: "f4",
        position: { x: 0, y: 0 },
        data: { kind: "in" },
      },
    ];
    const edges: Edge[] = [
      { id: "ha", source: "a-out", target: "a-in", data: { itemId: "plate" } },
      { id: "vb", source: "b-out", target: "b-in", data: { itemId: "wire" } },
    ];
    // Horizontal edge's free vertical at x=150 overlapping foreign V
    const points = [
      { x: 100, y: 54 },
      { x: 150, y: 54 },
      { x: 150, y: 200 },
      { x: 300, y: 200 },
    ];
    setOrthoDragPreview("vb", [
      { x: 150, y: 0 },
      { x: 150, y: 300 },
    ]);
    try {
      const locks = detectIntersectionLocks("ha", points, edges, nodes);
      expect(locks).toHaveLength(0);
      const foreign = collectVerticalSegments(edges, nodes, "ha");
      expect(foreign.some((s) => s.edgeId === "vb")).toBe(true);
      const same = collectVerticalSegments(edges, nodes, "ha", {
        sameNetworkAs: "ha",
      });
      expect(same.some((s) => s.edgeId === "vb")).toBe(false);
    } finally {
      clearOrthoDragPreview("vb");
    }
  });

  it("fuseRouteOnRelease keeps a horizontal kink next to a foreign vertical", () => {
    const nodes: Node[] = [
      { id: "f1", type: "machineFrame", position: { x: 0, y: 0 }, data: {} },
      {
        id: "out",
        type: "itemPort",
        parentId: "f1",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      { id: "f2", type: "machineFrame", position: { x: 400, y: 80 }, data: {} },
      {
        id: "in",
        type: "itemPort",
        parentId: "f2",
        position: { x: 0, y: 0 },
        data: { kind: "in" },
      },
      { id: "f3", type: "machineFrame", position: { x: 180, y: -40 }, data: {} },
      {
        id: "vout",
        type: "itemPort",
        parentId: "f3",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      { id: "f4", type: "machineFrame", position: { x: 180, y: 300 }, data: {} },
      {
        id: "vin",
        type: "itemPort",
        parentId: "f4",
        position: { x: 0, y: 0 },
        data: { kind: "in" },
      },
    ];
    const edges: Edge[] = [
      { id: "h", source: "out", target: "in", data: { itemId: "plate" } },
      { id: "v", source: "vout", target: "vin", data: { itemId: "wire" } },
    ];

    // Manual kink: H → V jog → H (free vertical at x=200 next to foreign trunk)
    const kinked = [
      { x: 100, y: 54 },
      { x: 200, y: 54 },
      { x: 200, y: 120 },
      { x: 400, y: 120 },
    ];

    setOrthoDragPreview("v", [
      { x: 200, y: 0 },
      { x: 200, y: 300 },
    ]);
    try {
      const fused = fuseRouteOnRelease(kinked, "h", edges, nodes);
      const stillJog = fused.some(
        (p, i) => i > 0 && i < fused.length - 1 && Math.abs(p.y - 54) > 2,
      );
      expect(stillJog).toBe(true);
      // Free vertical must not have been fused onto the foreign x=200 lock
      // in a way that collapses the route back to a single horizontal.
      expect(fused.length).toBeGreaterThanOrEqual(4);
    } finally {
      clearOrthoDragPreview("v");
    }
  });
});
