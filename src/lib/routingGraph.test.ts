import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateSegmentGeometry,
  buildJunctionNodes,
  buildSegmentEdges,
  composeLogicalRoutePoints,
  countSegmentsDrawnOnce,
  portAbsPos,
  rebuildRoutingGraph,
  resolveEndpointPos,
  resolveSegmentPoints,
  setSegmentCornersNorm,
  syncRoutingJunctionPositions,
  translateRailJunctions,
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
    // 4 stubs + bus links among per-port junctions
    expect(countSegmentsDrawnOnce(graph)).toBeGreaterThanOrEqual(5);
    expect(Object.keys(graph.junctions).length).toBe(4);
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
    expect(graph.segments[busId!]!.cornersAbs?.length).toBe(2);

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
    expect(graph.segments[stub]!.cornersAbs).toBeTruthy();
    const trunkAfter = Object.values(graph.segments)
      .filter((s) => s.id !== stub)
      .map((s) => JSON.stringify(s));
    expect(trunkAfter).toEqual(trunkBefore);
  });

  it("axis-aligned segment kink survives round-trip (no cornersNorm collapse)", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in1"), edge("e2", "out", "in2")];
    let { graph } = rebuildRoutingGraph(nodes, edges);
    const busId = Object.keys(graph.segments).find(
      (id) => !id.includes("p:"),
    )!;
    const seg = graph.segments[busId]!;
    const a = resolveEndpointPos(seg.a, nodes, graph)!;
    const b = resolveEndpointPos(seg.b, nodes, graph)!;
    // Vertical bus: kink sideways
    const kinkPts = [
      { x: a.x + 48, y: a.y + 20 },
      { x: a.x + 48, y: b.y - 20 },
    ];
    graph = setSegmentCornersNorm(graph, busId, kinkPts, {
      sx: a.x,
      sy: a.y,
      tx: b.x,
      ty: b.y,
    });
    const resolved = resolveSegmentPoints(
      graph.segments[busId]!,
      nodes,
      graph,
    )!;
    expect(resolved.some((p) => Math.abs(p.x - (a.x + 48)) < 1)).toBe(true);
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

  it("backwards N×M wraps outside machines (out rail right, in rail left)", () => {
    // Consumer on the left, feeder on the right → classic backwards route
    const nodes: Node[] = [
      frame("consumer", 0, 0),
      port("in1", "consumer", "in", 0, 0),
      frame("consumer2", 0, 200),
      port("in2", "consumer2", "in", 0, 0),
      frame("feeder", 400, 0),
      port("out1", "feeder", "out", 96, 0),
      frame("feeder2", 400, 200),
      port("out2", "feeder2", "out", 96, 0),
    ];
    const edges = [
      edge("e11", "out1", "in1"),
      edge("e12", "out1", "in2"),
      edge("e21", "out2", "in1"),
      edge("e22", "out2", "in2"),
    ];
    const { graph, edges: next } = rebuildRoutingGraph(nodes, edges);
    expect(graph.junctions["j-wrap-out"]).toBeTruthy();
    expect(graph.junctions["j-wrap-in"]).toBeTruthy();
    const outPos = portAbsPos(nodes, "out1")!;
    const inPos = portAbsPos(nodes, "in1")!;
    expect(graph.junctions["j-wrap-out"]!.x).toBeGreaterThan(outPos.x);
    expect(graph.junctions["j-wrap-in"]!.x).toBeLessThan(inPos.x);
    expect(graph.junctions["j-wrap-out"]!.y).toBeGreaterThan(
      Math.max(outPos.y, inPos.y),
    );
    // Composed path should not be a straight horizontal through the machines
    for (const e of next) {
      const pts = composeLogicalRoutePoints(e, nodes, graph)!;
      const midY = graph.junctions["j-wrap-out"]!.y;
      expect(pts.some((p) => Math.abs(p.y - midY) < 1)).toBe(true);
      // No point sits between the two machines at port height (through-body)
      const throughBody = pts.filter(
        (p) =>
          p.x > inPos.x + 20 &&
          p.x < outPos.x - 20 &&
          Math.abs(p.y - outPos.y) < 8,
      );
      expect(throughBody.length).toBe(0);
    }
  });

  it("stub kink survives resolveSegmentPoints (no forceOrthogonal collapse)", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in1"), edge("e2", "out", "in2")];
    let { graph } = rebuildRoutingGraph(nodes, edges);
    const stubId = Object.keys(graph.segments).find((id) =>
      id.includes("p:in2"),
    )!;
    const seg = graph.segments[stubId]!;
    const a = resolveEndpointPos(seg.a, nodes, graph)!;
    const b = resolveEndpointPos(seg.b, nodes, graph)!;
    // Input stub: junction → port. Kink away from the port attachment.
    const kinkPts = [
      { x: a.x, y: a.y + 40 },
      { x: (a.x + b.x) / 2, y: a.y + 40 },
      { x: (a.x + b.x) / 2, y: b.y },
    ];
    graph = setSegmentCornersNorm(graph, stubId, kinkPts, {
      sx: a.x,
      sy: a.y,
      tx: b.x,
      ty: b.y,
    });
    const resolved = resolveSegmentPoints(
      graph.segments[stubId]!,
      nodes,
      graph,
    )!;
    expect(resolved[0]).toEqual(a);
    expect(resolved[resolved.length - 1]).toEqual(b);
    expect(resolved.some((p) => Math.abs(p.y - (a.y + 40)) < 1)).toBe(true);
    expect(resolved.length).toBeGreaterThan(2);
  });

  it("adding a new input preserves existing stub kinks (stable per-port ids)", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    let { graph, edges: next } = rebuildRoutingGraph(nodes, [
      edge("e1", "out", "in1"),
      edge("e2", "out", "in2"),
    ]);
    const stub1 = Object.keys(graph.segments).find((id) =>
      id.includes("p:in1"),
    )!;
    const a = resolveEndpointPos(graph.segments[stub1]!.a, nodes, graph)!;
    const b = resolveEndpointPos(graph.segments[stub1]!.b, nodes, graph)!;
    const kink = [
      { x: a.x, y: a.y + 48 },
      { x: (a.x + b.x) / 2, y: a.y + 48 },
      { x: (a.x + b.x) / 2, y: b.y },
    ];
    graph = setSegmentCornersNorm(graph, stub1, kink, {
      sx: a.x,
      sy: a.y,
      tx: b.x,
      ty: b.y,
    });

    const nodes2: Node[] = [
      ...nodes,
      frame("m4", 400, 400),
      port("in3", "m4", "in", 0, 0),
    ];
    const edges2 = [
      ...next.filter((e) => e.id === "e1" || e.id === "e2"),
      edge("e3", "out", "in3"),
    ];
    const rebuilt = rebuildRoutingGraph(nodes2, edges2, graph);
    expect(rebuilt.graph.segments[stub1]?.cornersAbs?.length).toBeGreaterThan(0);
    const resolved = resolveSegmentPoints(
      rebuilt.graph.segments[stub1]!,
      nodes2,
      rebuilt.graph,
    )!;
    expect(resolved.some((p) => Math.abs(p.y - (a.y + 48)) < 1)).toBe(true);
    // New stub is a clean straight join (no inherited junk corners)
    const stub3 = Object.keys(rebuilt.graph.segments).find((id) =>
      id.includes("p:in3"),
    )!;
    expect(rebuilt.graph.segments[stub3]?.cornersAbs).toBeUndefined();
  });

  it("dragging consumer left of feeder rebuilds into backwards wrap", () => {
    const nodes: Node[] = [
      frame("feeder", 0, 0),
      port("out", "feeder", "out", 96, 0),
      frame("consumer", 400, 0),
      port("in1", "consumer", "in", 0, 0),
      frame("consumer2", 400, 200),
      port("in2", "consumer2", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in1"), edge("e2", "out", "in2")];
    const { graph: forward } = rebuildRoutingGraph(nodes, edges);
    expect(forward.junctions["j-wrap-out"]).toBeUndefined();

    const moved: Node[] = nodes.map((n) => {
      if (n.id === "consumer") return { ...n, position: { x: -400, y: 0 } };
      if (n.id === "consumer2") return { ...n, position: { x: -400, y: 200 } };
      return n;
    });
    const { graph: backward, edges: next } = rebuildRoutingGraph(
      moved,
      edges,
      forward,
    );
    expect(backward.junctions["j-wrap-out"]).toBeTruthy();
    expect(backward.junctions["j-wrap-in"]).toBeTruthy();
    const outPos = portAbsPos(moved, "out")!;
    const inPos = portAbsPos(moved, "in1")!;
    expect(backward.junctions["j-wrap-out"]!.x).toBeGreaterThan(outPos.x);
    expect(backward.junctions["j-wrap-in"]!.x).toBeLessThan(inPos.x);
    for (const e of next) {
      const pts = composeLogicalRoutePoints(e, moved, backward)!;
      const throughBody = pts.filter(
        (p) =>
          p.x > inPos.x + 20 &&
          p.x < outPos.x - 20 &&
          Math.abs(p.y - outPos.y) < 8,
      );
      expect(throughBody.length).toBe(0);
    }
  });

  it("resolveSegmentPoints aligns drifted stub Y so corners cannot overshoot", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    let { graph } = rebuildRoutingGraph(nodes, [
      edge("e1", "out", "in1"),
      edge("e2", "out", "in2"),
    ]);
    const stubId = Object.keys(graph.segments).find((id) =>
      id.includes("p:in1"),
    )!;
    const seg = graph.segments[stubId]!;
    const jid =
      seg.a.kind === "junction"
        ? seg.a.junctionId
        : seg.b.kind === "junction"
          ? seg.b.junctionId
          : null;
    expect(jid).toBeTruthy();
    const portPos = portAbsPos(nodes, "in1")!;
    const j = graph.junctions[jid!]!;
    // Drift junction Y by 4px and plant a corner past the rail (excroissance)
    graph = {
      ...graph,
      junctions: {
        ...graph.junctions,
        [jid!]: { ...j, y: portPos.y + 4 },
      },
    };
    graph = setSegmentCornersNorm(
      graph,
      stubId,
      [
        { x: j.x - 40, y: portPos.y + 4 },
        { x: j.x - 40, y: portPos.y + 40 },
        { x: (j.x + portPos.x) / 2, y: portPos.y + 40 },
      ],
      { sx: j.x, sy: portPos.y + 4, tx: portPos.x, ty: portPos.y },
    );
    const resolved = resolveSegmentPoints(
      graph.segments[stubId]!,
      nodes,
      graph,
    )!;
    const minX = Math.min(j.x, portPos.x);
    expect(resolved.every((p) => p.x >= minX - 0.51)).toBe(true);
    expect(resolved.every((p) => Math.abs(p.y - portPos.y) < 1 || p.y > portPos.y)).toBe(
      true,
    );
  });

  it("backwards in-rail keeps min horizontal stub on every input", () => {
    const nodes: Node[] = [
      frame("feeder", 400, 0),
      port("out", "feeder", "out", 96, 0),
      frame("left", -200, 0),
      port("inLeft", "left", "in", 0, 0),
      frame("right", 400, 200),
      port("inRight", "right", "in", 0, 0),
    ];
    const edges = [
      edge("e1", "out", "inLeft"),
      edge("e2", "out", "inRight"),
    ];
    const { graph } = rebuildRoutingGraph(nodes, edges);
    expect(graph.junctions["j-wrap-in"]).toBeTruthy();
    for (const pid of ["inLeft", "inRight"]) {
      const pos = portAbsPos(nodes, pid)!;
      const j = graph.junctions[`j-${pid}`]!;
      expect(j.x).toBeLessThanOrEqual(pos.x - 20);
      expect(Math.abs(j.x - pos.x)).toBeGreaterThanOrEqual(20);
    }
  });

  it("translateRailJunctions moves a vertical rail without leaving U-bend corners", () => {
    const nodes: Node[] = [
      frame("m1", 0, 0),
      port("out", "m1", "out", 96, 0),
      frame("m2", 400, 0),
      port("in1", "m2", "in", 0, 0),
      frame("m3", 400, 200),
      port("in2", "m3", "in", 0, 0),
    ];
    let { graph } = rebuildRoutingGraph(nodes, [
      edge("e1", "out", "in1"),
      edge("e2", "out", "in2"),
    ]);
    const busId = Object.keys(graph.segments).find((id) => {
      const s = graph.segments[id]!;
      return s.a.kind === "junction" && s.b.kind === "junction";
    })!;
    expect(busId).toBeTruthy();
    const seg = graph.segments[busId]!;
    const ja =
      seg.a.kind === "junction" ? graph.junctions[seg.a.junctionId]! : null;
    const jb =
      seg.b.kind === "junction" ? graph.junctions[seg.b.junctionId]! : null;
    expect(ja && jb).toBeTruthy();
    const before = ja!.x;
    graph = setSegmentCornersNorm(
      graph,
      busId,
      [
        { x: before + 40, y: ja!.y },
        { x: before + 40, y: jb!.y },
      ],
      {
        sx: before,
        sy: ja!.y,
        tx: before,
        ty: jb!.y,
      },
    );
    expect(graph.segments[busId]!.cornersAbs?.length).toBe(2);
    graph = translateRailJunctions(graph, busId, "x", before + 60);
    expect(graph.junctions[ja!.id]!.x).toBe(before + 60);
    expect(graph.junctions[jb!.id]!.x).toBe(before + 60);
    expect(graph.segments[busId]!.cornersAbs).toBeUndefined();
  });
});
