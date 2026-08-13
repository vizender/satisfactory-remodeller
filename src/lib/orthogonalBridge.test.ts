import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  buildEdgeNetworkIds,
  findBridgeCrossings,
  pointsToSvgPathWithBridges,
} from "@/lib/orthogonalEdgePath";
import { setOrthoDragPreview, clearOrthoDragPreview } from "@/lib/orthoDragPreview";

function edge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    data: {
      itemId: "x",
      corners: [
        { x: 100, y: 50 },
        { x: 100, y: 150 },
      ],
    },
  };
}

describe("orthogonal bridge arches", () => {
  it("buildEdgeNetworkIds unions ports connected by edges", () => {
    const edges = [
      edge("a", "p1", "p2"),
      edge("b", "p2", "p3"),
      edge("c", "q1", "q2"),
    ];
    const net = buildEdgeNetworkIds(edges);
    expect(net.get("a")).toBe(net.get("b"));
    expect(net.get("a")).not.toBe(net.get("c"));
  });

  it("pointsToSvgPathWithBridges inserts an arc on the vertical", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ];
    const d = pointsToSvgPathWithBridges(points, [{ x: 50, y: 50 }], 7);
    expect(d).toContain("A 7 7");
    expect(d).toMatch(/L 50,43/);
    expect(d).toMatch(/A 7 7 0 0 0 50,57/);
  });

  it("findBridgeCrossings ignores same-network edges and detects foreign H×V", () => {
    const nodes: Node[] = [
      {
        id: "f1",
        type: "machineFrame",
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: "out1",
        type: "itemPort",
        parentId: "f1",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      {
        id: "f2",
        type: "machineFrame",
        position: { x: 200, y: 0 },
        data: {},
      },
      {
        id: "in2",
        type: "itemPort",
        parentId: "f2",
        position: { x: 0, y: 0 },
        data: { kind: "in" },
      },
      {
        id: "f3",
        type: "machineFrame",
        position: { x: 0, y: 100 },
        data: {},
      },
      {
        id: "out3",
        type: "itemPort",
        parentId: "f3",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      {
        id: "f4",
        type: "machineFrame",
        position: { x: 200, y: 100 },
        data: {},
      },
      {
        id: "in4",
        type: "itemPort",
        parentId: "f4",
        position: { x: 0, y: 0 },
        data: { kind: "in" },
      },
    ];

    // Vertical trunk at x≈ mid for edge A (out1→in2)
    const edgeA: Edge = {
      id: "va",
      source: "out1",
      target: "in2",
      data: {
        itemId: "wire",
        corners: [
          { x: 150, y: 54 },
          { x: 150, y: 54 },
        ],
      },
    };
    // Force a clear orthogonal: source right of f1, target left of f2
    // Use absolute corners that create V at x=150 from y=20 to y=180
    // Actually resolveRoutePoints needs proper source/target from nodes.
    // Simpler: unit-test findBridgeCrossings with synthetic points + foreign edge
    // that has horizontal via drag preview.

    const edgeB: Edge = {
      id: "hb",
      source: "out3",
      target: "in4",
      data: { itemId: "plate" },
    };

    const pointsA = [
      { x: 120, y: 54 },
      { x: 150, y: 54 },
      { x: 150, y: 200 },
      { x: 200, y: 200 },
    ];
    // Horizontal crossing at y=120, x from 100..200
    setOrthoDragPreview("hb", [
      { x: 100, y: 120 },
      { x: 200, y: 120 },
    ]);
    try {
      const crosses = findBridgeCrossings(
        "va",
        pointsA,
        [edgeA, edgeB],
        nodes,
      );
      expect(crosses.some((c) => Math.abs(c.x - 150) < 1 && Math.abs(c.y - 120) < 1)).toBe(
        true,
      );
    } finally {
      clearOrthoDragPreview("hb");
    }
  });

  it("findBridgeCrossings skips edges in the same network", () => {
    const nodes: Node[] = [
      {
        id: "f1",
        type: "machineFrame",
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: "out1",
        type: "itemPort",
        parentId: "f1",
        position: { x: 96, y: 0 },
        data: { kind: "out" },
      },
      {
        id: "in2",
        type: "itemPort",
        parentId: "f1",
        position: { x: 0, y: 100 },
        data: { kind: "in" },
      },
      {
        id: "in3",
        type: "itemPort",
        parentId: "f1",
        position: { x: 0, y: 200 },
        data: { kind: "in" },
      },
    ];
    // Same network: both leave out1
    const edges: Edge[] = [
      { id: "e1", source: "out1", target: "in2", data: { itemId: "w" } },
      { id: "e2", source: "out1", target: "in3", data: { itemId: "w" } },
    ];
    const points = [
      { x: 120, y: 54 },
      { x: 150, y: 54 },
      { x: 150, y: 250 },
      { x: 10, y: 250 },
    ];
    setOrthoDragPreview("e2", [
      { x: 100, y: 150 },
      { x: 200, y: 150 },
    ]);
    try {
      const crosses = findBridgeCrossings("e1", points, edges, nodes);
      expect(crosses).toHaveLength(0);
    } finally {
      clearOrthoDragPreview("e2");
    }
  });
});
