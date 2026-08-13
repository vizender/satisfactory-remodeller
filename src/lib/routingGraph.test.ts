import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateSegmentGeometry,
  buildJunctionNodes,
  buildSegmentEdges,
  composeLogicalRoutePoints,
  countSegmentsDrawnOnce,
  rebuildRoutingGraph,
  setSegmentCornersNorm,
  syncRoutingJunctionPositions,
} from "@/lib/routingGraph";
import type { OrthoPoint } from "@/types/edgeData";

function port(
  id: string,
  parentId: string,
  kind: "in" | "out",
  x: number,
  y: number,
): Node {
  return {
    id,
    type: "itemPort",
    parentId,
    position: { x, y },
    data: { kind, itemId: "IronIngot" },
  };
}

function frame(id: string, x: number, y: number): Node {
  return {
    id,
    type: "machineFrame",
    position: { x, y },
    data: {},
  };
}

function edge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    data: { itemId: "IronIngot" },
  };
}

describe("shared routing graph (N×M)", () => {
  it("1→2 split: shared trunk segments, not N full copies", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    const edges = [
      edge("e1", "out", "in1"),
      edge("e2", "out", "in2"),
    ];
    const { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    expect(next.every((e) => (e.data as { routePath?: string[] }).routePath?.length)).toBe(
      true,
    );
    // stubs: out, in1, in2 + one bus V between the two input junctions (and out junction)
    // 3 port stubs + up to 2 bus links among 3 junctions
    expect(countSegmentsDrawnOnce(graph)).toBeLessThan(edges.length * 3);
    expect(assertNoDuplicateSegmentGeometry(graph)).toBe(true);
    const paths = next.map(
      (e) => (e.data as { routePath: string[] }).routePath,
    );
    // Shared bus segment(s) appear in both paths
    const shared = paths[0]!.filter((s) => paths[1]!.includes(s));
    expect(shared.length).toBeGreaterThan(0);
    // Output stub shared by both
    const outStub = paths[0]!.find((s) => paths[1]!.includes(s) && s.includes("p:out"));
    expect(outStub).toBeTruthy();
  });

  it("2→1 merge: shared trunk into the input", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out1", "m1", "out", 96, 0),
      frame("m2", 0, 200),
      port("out2", "m2", "out", 96, 0),
      frame("m3", 400, 100),
      port("in", "m3", "in", 0, 0),
    ];
    const edges = [
      edge("e1", "out1", "in"),
      edge("e2", "out2", "in"),
    ];
    const { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    const paths = next.map(
      (e) => (e.data as { routePath: string[] }).routePath,
    );
    const shared = paths[0]!.filter((s) => paths[1]!.includes(s));
    expect(shared.length).toBeGreaterThan(0);
    expect(Object.keys(graph.junctions).length).toBe(3);
    expect(assertNoDuplicateSegmentGeometry(graph)).toBe(true);
  });

  it("2×2 bus: shared vertical bus, one stroke per segment", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out1", "m1", "out", 96, 0),
      frame("m2", 0, 200),
      port("out2", "m2", "out", 96, 0),
      frame("m3", 400, 0),
      port("in1", "m3", "in", 0, 0),
      frame("m4", 400, 200),
      port("in2", "m4", "in", 0, 0),
    ];
    const edges = [
      edge("e11", "out1", "in1"),
      edge("e12", "out1", "in2"),
      edge("e21", "out2", "in1"),
      edge("e22", "out2", "in2"),
    ];
    const { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    // 4 stubs + 1 bus link between the two Y-level junctions = 5 segments
    expect(countSegmentsDrawnOnce(graph)).toBe(5);
    expect(Object.keys(graph.junctions).length).toBe(2);
    expect(assertNoDuplicateSegmentGeometry(graph)).toBe(true);
    for (const e of next) {
      expect((e.data as { routePath: string[] }).routePath.length).toBeGreaterThanOrEqual(2);
    }
    // Every logical path uses some shared bus segment
    const allSegs = Object.keys(graph.segments);
    const busSegs = allSegs.filter(
      (id) => id.includes("j-") && !id.includes("p:"),
    );
    expect(busSegs.length).toBeGreaterThan(0);
  });

  it("single edge stays classic (no routePath)", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in", "m2", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in")];
    const { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    expect(Object.keys(graph.segments)).toHaveLength(0);
    expect((next[0]!.data as { routePath?: string[] }).routePath).toBeUndefined();
  });

  it("kink on shared bus segment applies to all logical paths", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out1", "m1", "out", 96, 0),
      frame("m2", 0, 200),
      port("out2", "m2", "out", 96, 0),
      frame("m3", 400, 0),
      port("in1", "m3", "in", 0, 0),
      frame("m4", 400, 200),
      port("in2", "m4", "in", 0, 0),
    ];
    // Full 2×2 mesh so all ports share one network; cross paths share the bus
    const edges = [
      edge("e11", "out1", "in1"),
      edge("e12", "out1", "in2"),
      edge("e21", "out2", "in1"),
      edge("e22", "out2", "in2"),
    ];
    let { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    const cross = next.filter((e) => e.id === "e12" || e.id === "e21");
    expect(cross).toHaveLength(2);
    const path1 = (cross[0]!.data as { routePath: string[] }).routePath;
    const path2 = (cross[1]!.data as { routePath: string[] }).routePath;
    const busId = path1.find(
      (s) => path2.includes(s) && !s.includes("p:"),
    );
    expect(busId).toBeTruthy();

    const seg = graph.segments[busId!]!;
    const aJ =
      seg.a.kind === "junction" ? graph.junctions[seg.a.junctionId] : null;
    const bJ =
      seg.b.kind === "junction" ? graph.junctions[seg.b.junctionId] : null;
    expect(aJ && bJ).toBeTruthy();
    const kink: OrthoPoint[] = [
      { x: aJ!.x + 40, y: aJ!.y },
      { x: aJ!.x + 40, y: bJ!.y },
    ];
    graph = setSegmentCornersNorm(graph, busId!, kink, {
      sx: aJ!.x,
      sy: aJ!.y,
      tx: bJ!.x,
      ty: bJ!.y,
    });
    expect(graph.segments[busId!]!.cornersNorm?.length).toBe(2);

    const composed1 = composeLogicalRoutePoints(cross[0]!, nodes, graph)!;
    const composed2 = composeLogicalRoutePoints(cross[1]!, nodes, graph)!;
    expect(composed1.some((p) => Math.abs(p.x - (aJ!.x + 40)) < 1)).toBe(true);
    expect(composed2.some((p) => Math.abs(p.x - (aJ!.x + 40)) < 1)).toBe(true);
  });

  it("branch stub kink does not move the shared trunk", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in1"), edge("e2", "out", "in2")];
    let { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    const pathLower = (next.find((e) => e.target === "in2")!.data as {
      routePath: string[];
    }).routePath;
    const stub = pathLower[pathLower.length - 1]!;
    const trunkBefore = Object.values(graph.segments)
      .filter((s) => s.id !== stub)
      .map((s) => JSON.stringify(s));

    graph = setSegmentCornersNorm(
      graph,
      stub,
      [
        { x: 300, y: 250 },
        { x: 350, y: 250 },
      ],
      { sx: 200, sy: 254, tx: 400, ty: 254 },
    );
    expect(graph.segments[stub]!.cornersNorm).toBeTruthy();
    const trunkAfter = Object.values(graph.segments)
      .filter((s) => s.id !== stub)
      .map((s) => JSON.stringify(s));
    expect(trunkAfter).toEqual(trunkBefore);
  });

  it("syncRoutingJunctionPositions follows port Y after machine move", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in1"), edge("e2", "out", "in2")];
    const { graph } = rebuildRoutingGraph(nodes, edges);
    const moved: Node[] = nodes.map((n) =>
      n.id === "m3" ? { ...n, position: { x: 400, y: 300 } } : n,
    );
    const synced = syncRoutingJunctionPositions(moved, graph);
    expect(synced.junctions["j-in2"]!.y).toBeGreaterThan(graph.junctions["j-in2"]!.y);
  });

  it("junction nodes are RF-initialized so segment edges can mount", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    const { graph } = rebuildRoutingGraph(nodes, [
      edge("e1", "out", "in1"),
      edge("e2", "out", "in2"),
    ]);
    const jNodes = buildJunctionNodes(graph);
    expect(jNodes.length).toBeGreaterThan(0);
    for (const n of jNodes) {
      expect(n.width ?? n.initialWidth).toBeGreaterThan(0);
      expect(n.handles?.length).toBe(2);
      expect(n.handles?.some((h) => h.id === "js" && h.type === "source")).toBe(
        true,
      );
      expect(n.handles?.some((h) => h.id === "jt" && h.type === "target")).toBe(
        true,
      );
    }
    const segs = buildSegmentEdges(graph);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(s.sourceHandle).toBeTruthy();
      expect(s.targetHandle).toBeTruthy();
      // Port↔junction stubs use item + js/jt; bus uses js→jt
      if (s.source.startsWith("rj-")) expect(s.sourceHandle).toBe("js");
      if (s.target.startsWith("rj-")) expect(s.targetHandle).toBe("jt");
    }
  });
});
