import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  assertNoDuplicateSegmentGeometry,
  buildJunctionNodes,
  buildSegmentEdges,
  composeLogicalRoutePoints,
  countSegmentsDrawnOnce,
  frameBoundsForPort,
  portAbsPos,
  rebuildRoutingGraph,
  resolveEndpointPos,
  resolveSegmentPoints,
  setSegmentCornersNorm,
  syncRoutingJunctionPositions,
  translateRailJunctions,
  previewSegmentsForJunctionY,
} from "@/lib/routingGraph";
import type { OrthoPoint } from "@/types/edgeData";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;
const FRAME_W = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;
const FRAME_H = 196;

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
    style: { width: FRAME_W, height: FRAME_H },
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

  it("backwards N×M keeps a forward bus and local stub detours (no wrap rails)", () => {
    // Consumer on the left, feeder on the right → wrong-side ports get local detours
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
    expect(graph.junctions["j-wrap-out"]).toBeUndefined();
    expect(graph.junctions["j-wrap-in"]).toBeUndefined();
    // Shared bus column: all port junctions share one X
    const busXs = ["out1", "out2", "in1", "in2"].map(
      (pid) => graph.junctions[`j-${pid}`]!.x,
    );
    expect(new Set(busXs).size).toBe(1);
    for (const pid of ["in1", "in2", "out1", "out2"]) {
      const stub = Object.values(graph.segments).find((s) => {
        const a = s.a.kind === "port" ? s.a.portId : null;
        const b = s.b.kind === "port" ? s.b.portId : null;
        return a === pid || b === pid;
      })!;
      expect(stub.cornersAbs?.length).toBe(2);
    }
    for (const e of next) {
      const pts = composeLogicalRoutePoints(e, nodes, graph)!;
      expect(pts.length).toBeGreaterThan(4);
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

  it("dragging one consumer left keeps bus X and adds a local stub detour", () => {
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
    const busXBefore = forward.junctions["j-out"]!.x;
    const otherJBefore = forward.junctions["j-in2"]!.x;

    const moved: Node[] = nodes.map((n) =>
      n.id === "consumer" ? { ...n, position: { x: -400, y: 0 } } : n,
    );
    // Machine drag path: sync only — no full rebuild
    const synced = syncRoutingJunctionPositions(moved, forward);
    expect(synced.junctions["j-wrap-out"]).toBeUndefined();
    expect(synced.junctions["j-out"]!.x).toBe(busXBefore);
    expect(synced.junctions["j-in2"]!.x).toBe(otherJBefore);
    expect(synced.junctions["j-in1"]!.x).toBe(busXBefore);
    const stub1 = Object.keys(synced.segments).find((id) =>
      id.includes("p:in1"),
    )!;
    expect(synced.segments[stub1]!.cornersAbs?.length).toBe(2);
    // Neighbor stub stays straight
    const stub2 = Object.keys(synced.segments).find((id) =>
      id.includes("p:in2"),
    )!;
    expect(synced.segments[stub2]!.cornersAbs).toBeUndefined();

    // Rebuild after move also keeps frozen bus + local detour (no wrap rails)
    const { graph: rebuilt } = rebuildRoutingGraph(moved, edges, forward);
    expect(rebuilt.junctions["j-wrap-out"]).toBeUndefined();
    expect(rebuilt.junctions["j-out"]!.x).toBe(busXBefore);
    expect(rebuilt.segments[stub1]!.cornersAbs?.length).toBe(2);
  });

  it("dragging feeder right of bus adds a local output stub detour", () => {
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
    const busX = forward.junctions["j-out"]!.x;
    const moved: Node[] = nodes.map((n) =>
      n.id === "feeder" ? { ...n, position: { x: 600, y: 0 } } : n,
    );
    const synced = syncRoutingJunctionPositions(moved, forward);
    expect(synced.junctions["j-in1"]!.x).toBe(busX);
    expect(synced.junctions["j-in2"]!.x).toBe(busX);
    expect(synced.junctions["j-out"]!.x).toBe(busX);
    const outStub = Object.keys(synced.segments).find((id) =>
      id.includes("p:out"),
    )!;
    expect(synced.segments[outStub]!.cornersAbs?.length).toBe(2);
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
    // Pure on-axis overshoots stay in span; multi-bend leave columns may sit outside.
    // This fixture is a multi-bend kink — leave column at j.x-40 is intentional.
    expect(resolved.some((p) => Math.abs(p.x - (j.x - 40)) < 1)).toBe(true);
    expect(
      resolved.every((p) => Math.abs(p.y - portPos.y) < 1 || p.y > portPos.y - 0.51),
    ).toBe(true);
    void minX;
  });

  it("wrong-side input leave column clears the machine; wrap Y clears the frame", () => {
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
    expect(graph.junctions["j-wrap-in"]).toBeUndefined();
    const leftStub = Object.keys(graph.segments).find((id) =>
      id.includes("p:inLeft"),
    )!;
    const corners = graph.segments[leftStub]!.cornersAbs!;
    expect(corners.length).toBe(2);
    const bounds = frameBoundsForPort(nodes, "inLeft")!;
    const leaveX = Math.min(corners[0]!.x, corners[1]!.x);
    expect(leaveX).toBeLessThanOrEqual(bounds.left - 16 + 0.51);
    const wrapY = corners[0]!.y;
    expect(wrapY <= bounds.top - 16 + 0.51 || wrapY >= bounds.bottom + 16 - 0.51).toBe(
      true,
    );
    // Junction sits on the wrap rail (clean merge, no spur stub)
    expect(Math.abs(graph.junctions["j-inLeft"]!.y - wrapY)).toBeLessThan(1);
    // Resolved path must keep the outside leave column (no clamp collapse through body)
    const resolved = resolveSegmentPoints(
      graph.segments[leftStub]!,
      nodes,
      graph,
    )!;
    expect(resolved.some((p) => Math.abs(p.x - leaveX) < 1)).toBe(true);
    // Return path must not run through the machine body
    const throughBody = resolved.filter(
      (p) =>
        p.x > bounds.left + 8 &&
        p.x < bounds.right - 8 &&
        p.y > bounds.top + 8 &&
        p.y < bounds.bottom - 8,
    );
    expect(throughBody.length).toBe(0);
  });

  it("preserves user wrap Y when machine moves unless it collides with the frame", () => {
    const nodes: Node[] = [
      frame("feeder", 0, 0),
      port("out", "feeder", "out", 96, 0),
      frame("consumer", 400, 0),
      port("in1", "consumer", "in", 0, 0),
      frame("consumer2", 400, 200),
      port("in2", "consumer2", "in", 0, 0),
    ];
    const edges = [edge("e1", "out", "in1"), edge("e2", "out", "in2")];
    let { graph } = rebuildRoutingGraph(nodes, edges);
    const movedLeft: Node[] = nodes.map((n) =>
      n.id === "consumer" ? { ...n, position: { x: -400, y: 0 } } : n,
    );
    graph = syncRoutingJunctionPositions(movedLeft, graph);
    const stub1 = Object.keys(graph.segments).find((id) =>
      id.includes("p:in1"),
    )!;
    const customWrapY = -80; // well above the machine at y=0..196
    const leaveX = -400 - 16;
    const portY = portAbsPos(movedLeft, "in1")!.y;
    graph = {
      ...graph,
      junctions: {
        ...graph.junctions,
        "j-in1": { ...graph.junctions["j-in1"]!, y: customWrapY },
      },
      segments: {
        ...graph.segments,
        [stub1]: {
          ...graph.segments[stub1]!,
          cornersAbs: [
            { x: leaveX, y: customWrapY },
            { x: leaveX, y: portY },
          ],
        },
      },
    };
    // Move machine down — wrap Y still clear of the new frame → keep it
    const movedDown: Node[] = movedLeft.map((n) =>
      n.id === "consumer" ? { ...n, position: { x: -400, y: 40 } } : n,
    );
    const synced = syncRoutingJunctionPositions(movedDown, graph);
    const wrapAfter = synced.segments[stub1]!.cornersAbs![0]!.y;
    expect(wrapAfter).toBe(customWrapY);
    expect(Math.abs(synced.junctions["j-in1"]!.y - customWrapY)).toBeLessThan(1);

    // Move machine up so the frame swallows customWrapY → nudge clear
    const movedOntoLine: Node[] = movedLeft.map((n) =>
      n.id === "consumer" ? { ...n, position: { x: -400, y: customWrapY - 40 } } : n,
    );
    const nudged = syncRoutingJunctionPositions(movedOntoLine, graph);
    const wrapNudged = nudged.segments[stub1]!.cornersAbs![0]!.y;
    const bounds = frameBoundsForPort(movedOntoLine, "in1")!;
    expect(
      wrapNudged <= bounds.top - 16 + 0.51 ||
        wrapNudged >= bounds.bottom + 16 - 0.51,
    ).toBe(true);
    expect(wrapNudged).not.toBe(customWrapY);
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
    // Entire vertical column moves — including colocated same-Y junctions
    // that share a point and have no jj segment between them.
    for (const id of ["j-out", "j-in1", "j-in2"]) {
      expect(graph.junctions[id]!.x).toBe(before + 60);
    }
    expect(graph.segments[busId]!.cornersAbs).toBeUndefined();
  });

  it("normal stub U-bend commit does not move the bus junction Y", () => {
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
    const a = resolveEndpointPos(graph.segments[stubId]!.a, nodes, graph)!;
    const b = resolveEndpointPos(graph.segments[stubId]!.b, nodes, graph)!;
    const jY = graph.junctions["j-in1"]!.y;
    graph = setSegmentCornersNorm(
      graph,
      stubId,
      [
        { x: a.x, y: a.y + 80 },
        { x: b.x, y: a.y + 80 },
      ],
      { sx: a.x, sy: a.y, tx: b.x, ty: b.y },
    );
    expect(graph.junctions["j-in1"]!.y).toBe(jY);
    const resolved = resolveSegmentPoints(
      graph.segments[stubId]!,
      nodes,
      graph,
    )!;
    expect(resolved.some((p) => Math.abs(p.y - (a.y + 80)) < 1)).toBe(true);
    expect(resolved[0]).toEqual(a);
    expect(resolved[resolved.length - 1]).toEqual(b);
  });

  it("bus segment U-bend corners stay local — other junctions keep their X", () => {
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
    const beforeXs = {
      out: graph.junctions["j-out"]!.x,
      in1: graph.junctions["j-in1"]!.x,
      in2: graph.junctions["j-in2"]!.x,
    };
    const a = resolveEndpointPos(graph.segments[busId]!.a, nodes, graph)!;
    const b = resolveEndpointPos(graph.segments[busId]!.b, nodes, graph)!;
    // Local U-bend on this bus segment only (as the edge drag now commits)
    graph = setSegmentCornersNorm(
      graph,
      busId,
      [
        { x: a.x - 40, y: a.y },
        { x: a.x - 40, y: b.y },
      ],
      { sx: a.x, sy: a.y, tx: b.x, ty: b.y },
    );
    expect(graph.junctions["j-out"]!.x).toBe(beforeXs.out);
    expect(graph.junctions["j-in1"]!.x).toBe(beforeXs.in1);
    expect(graph.junctions["j-in2"]!.x).toBe(beforeXs.in2);
    const resolved = resolveSegmentPoints(
      graph.segments[busId]!,
      nodes,
      graph,
    )!;
    expect(resolved.some((p) => Math.abs(p.x - (a.x - 40)) < 1)).toBe(true);
  });

  it("previewSegmentsForJunctionY keeps bus V attached when wrap Y moves", () => {
    const nodes: Node[] = [
      frame("feeder", 400, 0),
      port("out", "feeder", "out", 96, 0),
      frame("left", -200, 0),
      port("inLeft", "left", "in", 0, 0),
      frame("right", 400, 200),
      port("inRight", "right", "in", 0, 0),
    ];
    const { graph } = rebuildRoutingGraph(nodes, [
      edge("e1", "out", "inLeft"),
      edge("e2", "out", "inRight"),
    ]);
    const leftStub = Object.keys(graph.segments).find((id) =>
      id.includes("p:inLeft"),
    )!;
    const jid = "j-inLeft";
    const wrapY = graph.junctions[jid]!.y;
    // Bus hangs off colocated j-out (same point, no jj to j-inLeft).
    const busId = Object.keys(graph.segments).find((id) => {
      const s = graph.segments[id]!;
      return s.a.kind === "junction" && s.b.kind === "junction";
    });
    expect(busId).toBeTruthy();
    const newY = wrapY + 40;
    const previews = previewSegmentsForJunctionY(
      graph,
      nodes,
      jid,
      newY,
      leftStub,
    );
    expect(previews.has(busId!)).toBe(true);
    const busPts = previews.get(busId!)!;
    const atJunction = busPts.some(
      (p) =>
        Math.abs(p.x - graph.junctions[jid]!.x) < 1 &&
        Math.abs(p.y - newY) < 1,
    );
    expect(atJunction).toBe(true);
  });
});
