import { describe, expect, it } from "vitest";
import {
  ALL_SCENES,
  e,
  graphFor,
  p,
  scene1,
  scene2,
  scene3,
  scene4,
  scene5,
  scene6,
  scene7,
  scene8,
  scene9,
  scene10,
} from "./fixtures";
import { MIN_PORT_STUB, MIN_SEG, REVERSE_CLEARANCE } from "./constants";
import { assertInvariants, countByAxis, countByKind } from "./invariants";
import { addTopologyEdge, buildRouteGraph } from "./layout";
import { computeHops } from "./hops";
import { deleteSegment, pruneRouteGraph } from "./delete";
import { dragSegment, kinkSegment } from "./ops";
import { resetRouteIds } from "./ids";
import { followPortVertices } from "./machineDrag";
import { nextSegmentSelection } from "./selection";
import { emptyRouteGraph } from "./types";
import {
  addPortVertex,
  addSegment,
  addVertex,
  asGraph,
  toWorking,
} from "./working";
import { collapseWorking } from "./collapse";
import { alignmentTargets } from "./snap";
import { illegalFuseAlignments } from "./portStub";

describe("default layout scenes", () => {
  it("scene 1: single H, two port vertices", () => {
    const g = graphFor(scene1());
    assertInvariants(g);
    expect(g.segments).toHaveLength(1);
    expect(g.segments[0]!.axis).toBe("h");
    expect(g.vertices.filter((v) => v.kind === "port")).toHaveLength(2);
    expect(g.nets).toHaveLength(1);
  });

  it("scene 2: H+V+H", () => {
    const g = graphFor(scene2());
    assertInvariants(g);
    expect(g.segments).toHaveLength(3);
    expect(countByAxis(g, "h")).toBe(2);
    expect(countByAxis(g, "v")).toBe(1);
    expect(countByKind(g, "corner")).toBe(2);
  });

  it("scene 3: reverse offset wraps with 5 segments, not through the target", () => {
    const g = graphFor(scene3());
    assertInvariants(g);
    expect(g.segments).toHaveLength(5);
    expect(countByAxis(g, "h")).toBe(3);
    expect(countByAxis(g, "v")).toBe(2);
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const tgt = g.vertices.find((v) => v.portId === "t")!;
    const src = g.vertices.find((v) => v.portId === "s")!;
    const tgtStub = g.segments.find((s) => s.a === tgt.id || s.b === tgt.id)!;
    const srcStub = g.segments.find((s) => s.a === src.id || s.b === src.id)!;
    const tgtFar = byId.get(tgtStub.a === tgt.id ? tgtStub.b : tgtStub.a)!;
    const srcFar = byId.get(srcStub.a === src.id ? srcStub.b : srcStub.a)!;
    expect(tgtFar.x).toBeLessThan(tgt.x);
    expect(srcFar.x).toBeGreaterThan(src.x);
    const bus = g.segments.find((s) => {
      if (s.axis !== "h") return false;
      const a = byId.get(s.a)!;
      const b = byId.get(s.b)!;
      return !a.portId && !b.portId;
    })!;
    const busY = byId.get(bus.a)!.y;
    expect(Math.abs(busY - tgt.y)).toBeGreaterThanOrEqual(REVERSE_CLEARANCE - 1);
    expect(Math.abs(busY - src.y)).toBeGreaterThanOrEqual(REVERSE_CLEARANCE - 1);
    // Target is lower → wrap under (the closer side).
    expect(busY).toBeGreaterThan(tgt.y);
  });

  it("scene 4: reverse aligned U clears both ports", () => {
    const g = graphFor(scene4());
    assertInvariants(g);
    expect(g.segments).toHaveLength(5);
    expect(countByAxis(g, "h")).toBe(3);
    expect(countByAxis(g, "v")).toBe(2);
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const portY = g.vertices.find((v) => v.portId === "s")!.y;
    const bus = g.segments.find((s) => {
      if (s.axis !== "h") return false;
      const a = byId.get(s.a)!;
      const b = byId.get(s.b)!;
      return !a.portId && !b.portId;
    })!;
    const busY = byId.get(bus.a)!.y;
    expect(Math.abs(busY - portY)).toBeGreaterThanOrEqual(REVERSE_CLEARANCE - 1);
    // Same Y: no closer side, keep the bus above.
    expect(busY).toBeLessThan(portY);
  });

  it("reverse offset wraps below when the target is lower, above when it is higher", () => {
    const lowTarget = graphFor({
      id: 31,
      name: "reverse target lower",
      ports: [p("s", 400, 40, "out"), p("t", 0, 200, "in")],
      edges: [e("e1", "s", "t")],
    });
    const highTarget = graphFor({
      id: 32,
      name: "reverse target higher",
      ports: [p("s", 400, 200, "out"), p("t", 0, 40, "in")],
      edges: [e("e1", "s", "t")],
    });
    const busY = (g: typeof lowTarget) => {
      const byId = new Map(g.vertices.map((v) => [v.id, v]));
      const bus = g.segments.find((s) => {
        if (s.axis !== "h") return false;
        const a = byId.get(s.a)!;
        const b = byId.get(s.b)!;
        return !a.portId && !b.portId;
      })!;
      return byId.get(bus.a)!.y;
    };
    expect(busY(lowTarget)).toBeGreaterThan(200);
    expect(busY(highTarget)).toBeLessThan(40);
  });

  it("reverse offset with a wide Y gap puts the bus between the ports", () => {
    const g = graphFor({
      id: 33,
      name: "reverse wide gap",
      ports: [p("s", 400, 40, "out"), p("t", 0, 400, "in")],
      edges: [e("e1", "s", "t")],
    });
    assertInvariants(g);
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const bus = g.segments.find((s) => {
      if (s.axis !== "h") return false;
      const a = byId.get(s.a)!;
      const b = byId.get(s.b)!;
      return !a.portId && !b.portId;
    })!;
    const busY = byId.get(bus.a)!.y;
    expect(busY).toBeGreaterThan(40 + REVERSE_CLEARANCE - 1);
    expect(busY).toBeLessThan(400 - REVERSE_CLEARANCE + 1);
  });

  it("scene 5: 1-to-2 has one 3SI and no 4SI", () => {
    const g = graphFor(scene5());
    assertInvariants(g);
    expect(countByKind(g, "3si")).toBeGreaterThanOrEqual(1);
    expect(countByKind(g, "4si")).toBe(0);
    expect(g.nets).toHaveLength(1);
    expect(g.nets[0]!.edgeIds).toHaveLength(2);
  });

  it("scene 6: 1-to-3 bus uses 3SIs not a 4SI", () => {
    const g = graphFor(scene6());
    assertInvariants(g);
    expect(countByKind(g, "4si")).toBe(0);
    expect(countByKind(g, "3si")).toBeGreaterThanOrEqual(1);
    expect(g.nets[0]!.edgeIds).toHaveLength(3);
  });

  it("scene 7: 2-to-1 is symmetric to 1-to-N", () => {
    const g = graphFor(scene7());
    assertInvariants(g);
    expect(countByKind(g, "4si")).toBe(0);
    expect(countByKind(g, "3si")).toBeGreaterThanOrEqual(1);
  });

  it("scene 8: 2-to-2 bus has 3SIs, not a 4SI", () => {
    const g = graphFor(scene8());
    assertInvariants(g);
    expect(countByKind(g, "4si")).toBe(0);
    expect(countByKind(g, "3si")).toBeGreaterThanOrEqual(1);
    expect(g.nets).toHaveLength(1);
  });

  it("scene 9: two nets cross with hops, no shared vertex", () => {
    const g = graphFor(scene9());
    assertInvariants(g);
    expect(g.nets).toHaveLength(2);
    const hops = computeHops(g);
    expect(hops.length).toBeGreaterThanOrEqual(1);
    expect(hops.every((h) => h.axis === "v")).toBe(true);
    const vIds = new Set(
      g.segments.filter((s) => s.axis === "v").map((s) => s.id),
    );
    expect(hops.every((h) => vIds.has(h.segmentId))).toBe(true);
    const ids = new Set(g.vertices.map((v) => v.id));
    for (const s of g.segments) {
      expect(ids.has(s.a)).toBe(true);
      expect(ids.has(s.b)).toBe(true);
    }
  });

  it("scene 10: mixed board has multiple nets and valid geometry", () => {
    const g = graphFor(scene10());
    assertInvariants(g);
    expect(g.nets.length).toBeGreaterThanOrEqual(3);
  });

  it("every scene satisfies invariants", () => {
    for (const sc of ALL_SCENES) {
      const g = graphFor(sc);
      assertInvariants(g);
    }
  });
});

describe("incremental add (least change)", () => {
  it("second target inserts a 3SI on the existing stub", () => {
    resetRouteIds(1);
    const ports = [
      p("s", 0, 100, "out"),
      p("t1", 400, 100, "in"),
      p("t2", 400, 220, "in"),
    ];
    let g = buildRouteGraph(ports, [e("e1", "s", "t1")]);
    expect(g.segments).toHaveLength(1);
    g = addTopologyEdge(g, ports, e("e2", "s", "t2"));
    assertInvariants(g);
    expect(countByKind(g, "3si")).toBeGreaterThanOrEqual(1);
    const t1 = g.vertices.find((v) => v.portId === "t1");
    expect(t1?.y).toBe(100);
  });

  it("4 sources onto a bus attach at the current end, not a higher 3SI", () => {
    resetRouteIds(1);
    const ports = [
      p("s1", 0, 40, "out"),
      p("s2", 0, 120, "out"),
      p("s3", 0, 200, "out"),
      p("s4", 0, 280, "out"),
      p("t", 400, 40, "in"),
    ];
    let g = buildRouteGraph(ports, [e("e1", "s1", "t")]);
    g = addTopologyEdge(g, ports, e("e2", "s2", "t"));
    g = addTopologyEdge(g, ports, e("e3", "s3", "t"));
    g = addTopologyEdge(g, ports, e("e4", "s4", "t"));
    assertInvariants(g);
    expect(countByKind(g, "4si")).toBe(0);

    const byPort = (id: string) => g.vertices.find((v) => v.portId === id)!;
    const busOf = (portId: string) => {
      const port = byPort(portId);
      const stub = g.segments.find((s) => s.a === port.id || s.b === port.id)!;
      const farId = stub.a === port.id ? stub.b : stub.a;
      return g.vertices.find((v) => v.id === farId)!;
    };
    const j3 = busOf("s3");
    const j4 = busOf("s4");
    expect(j3.kind).toBe("3si");
    expect(j4.kind).toBe("corner");
    expect(j3.x).toBe(j4.x);
    expect(
      g.segments.some(
        (s) =>
          s.axis === "v" &&
          ((s.a === j3.id && s.b === j4.id) || (s.a === j4.id && s.b === j3.id)),
      ),
    ).toBe(true);
  });
});

describe("kink and delete", () => {
  it("kink on same-Y 1-H becomes a 5-segment U", () => {
    const g0 = graphFor(scene1());
    const seg = g0.segments[0]!;
    const g = kinkSegment(g0, seg.id, { x: 200, y: 100 }, { x: 200, y: 160 });
    assertInvariants(g);
    expect(g.segments).toHaveLength(5);
    expect(countByAxis(g, "h")).toBe(3);
    expect(countByAxis(g, "v")).toBe(2);
  });

  it("delete a branch keeps the other path", () => {
    const g0 = graphFor(scene5());
    const t2 = g0.vertices.find((v) => v.portId === "t2");
    expect(t2).toBeTruthy();
    const stub = g0.segments.find((s) => s.a === t2!.id || s.b === t2!.id);
    expect(stub).toBeTruthy();
    const { graph, removedEdgeIds } = deleteSegment(g0, stub!.id, scene5().edges);
    assertInvariants(graph);
    expect(removedEdgeIds).toContain("e2");
    expect(graph.nets[0]?.edgeIds).toContain("e1");
    expect(graph.vertices.some((v) => v.portId === "t1")).toBe(true);
  });
});

describe("4SI split", () => {
  it("dragging the east H of a cross yields two 3SIs", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e"] });
    const c = addVertex(w, 100, 100, "4si");
    const n = addPortVertex(w, "n", 100, 40);
    const s = addPortVertex(w, "s", 100, 160);
    const west = addPortVertex(w, "w", 40, 100);
    const east = addVertex(w, 180, 100);
    const eastTip = addPortVertex(w, "e", 180, 160);
    addSegment(w, c.id, n.id, netId, "v");
    addSegment(w, c.id, s.id, netId, "v");
    addSegment(w, c.id, west.id, netId, "h");
    const eastSeg = addSegment(w, c.id, east.id, netId, "h")!;
    addSegment(w, east.id, eastTip.id, netId, "v");
    collapseWorking(w);
    let g = asGraph(w);
    expect(countByKind(g, "4si")).toBe(1);

    g = dragSegment(g, eastSeg.id, { x: 140, y: 140 });
    assertInvariants(g);
    expect(countByKind(g, "4si")).toBe(0);
    expect(countByKind(g, "3si")).toBeGreaterThanOrEqual(2);
  });
});

describe("machine drag stubs-stretch", () => {
  it("moving one port in Y on a 1-H inserts H+V+H", () => {
    const g0 = graphFor(scene1());
    const g = followPortVertices(g0, [
      p("s", 0, 160, "out"),
      p("t", 400, 100, "in"),
    ]);
    assertInvariants(g);
    expect(g.segments).toHaveLength(3);
    expect(countByAxis(g, "h")).toBe(2);
    expect(countByAxis(g, "v")).toBe(1);
  });

  it("does not translate a 3SI when the source port moves in Y", () => {
    const g0 = graphFor(scene5());
    const j = g0.vertices.find((v) => v.kind === "3si");
    expect(j).toBeTruthy();
    const g = followPortVertices(
      g0,
      scene5().ports.map((x) => (x.portId === "s" ? { ...x, y: 160 } : x)),
    );
    assertInvariants(g);
    const j2 = g.vertices.find((v) => v.id === j!.id);
    expect(j2?.y).toBe(j!.y);
  });

  it("dragging a source closer slides the V to keep a min outward stub", () => {
    const g0 = graphFor(scene2());
    const g = followPortVertices(g0, [
      p("s", 300, 40, "out"),
      p("t", 400, 200, "in"),
    ]);
    assertInvariants(g);
    const src = g.vertices.find((v) => v.portId === "s")!;
    const stub = g.segments.find((s) => s.a === src.id || s.b === src.id)!;
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const far = byId.get(stub.a === src.id ? stub.b : stub.a)!;
    expect(far.x).toBeGreaterThanOrEqual(src.x + MIN_PORT_STUB - 1);
    expect(far.x).toBeLessThan(byId.get(g.vertices.find((v) => v.portId === "t")!.id)!.x);
  });

  it("dragging a source past the target rebuilds a reverse wrap", () => {
    const g0 = graphFor(scene2());
    const g = followPortVertices(g0, [
      p("s", 480, 40, "out"),
      p("t", 400, 200, "in"),
    ]);
    assertInvariants(g);
    expect(g.segments.length).toBeGreaterThanOrEqual(5);
    const src = g.vertices.find((v) => v.portId === "s")!;
    const tgt = g.vertices.find((v) => v.portId === "t")!;
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const srcStub = g.segments.find((s) => s.a === src.id || s.b === src.id)!;
    const tgtStub = g.segments.find((s) => s.a === tgt.id || s.b === tgt.id)!;
    const srcFar = byId.get(srcStub.a === src.id ? srcStub.b : srcStub.a)!;
    const tgtFar = byId.get(tgtStub.a === tgt.id ? tgtStub.b : tgtStub.a)!;
    expect(srcFar.x).toBeGreaterThan(src.x);
    expect(tgtFar.x).toBeLessThan(tgt.x);
  });

  it("dragging a reverse source away slides its V to keep the min stub", () => {
    const g0 = graphFor(scene3());
    const src0 = g0.vertices.find((v) => v.portId === "s")!;
    const g = followPortVertices(g0, [
      p("s", 520, 40, "out"),
      p("t", 0, 200, "in"),
    ]);
    assertInvariants(g);
    const src = g.vertices.find((v) => v.portId === "s")!;
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const stub = g.segments.find((s) => s.a === src.id || s.b === src.id)!;
    const far = byId.get(stub.a === src.id ? stub.b : stub.a)!;
    expect(far.x).toBeGreaterThanOrEqual(src.x + MIN_PORT_STUB - 1);
    expect(src.x).toBeGreaterThan(src0.x);
  });
});

describe("dangling ends and unrooted loops", () => {
  it("collapses a degree-1 spur off a valid net", () => {
    const g0 = graphFor(scene2());
    const w = toWorking(g0);
    const corner = [...w.vertices.values()].find((v) => !v.portId)!;
    const netId = w.segments.values().next().value!.netId;
    const tip = addVertex(w, corner.x + 80, corner.y);
    addSegment(w, corner.id, tip.id, netId, "h");
    collapseWorking(w);
    const g = asGraph(w);
    assertInvariants(g);
    expect(g.vertices.some((v) => v.id === tip.id)).toBe(false);
    expect(g.segments).toHaveLength(3);
  });

  it("drops a floating rectangle attached to no port", () => {
    const g0 = graphFor(scene1());
    const w = toWorking(g0);
    const netId = w.segments.values().next().value!.netId;
    const a = addVertex(w, 0, 300);
    const b = addVertex(w, 80, 300);
    const c = addVertex(w, 80, 380);
    const d = addVertex(w, 0, 380);
    addSegment(w, a.id, b.id, netId, "h");
    addSegment(w, b.id, c.id, netId, "v");
    addSegment(w, c.id, d.id, netId, "h");
    addSegment(w, d.id, a.id, netId, "v");
    collapseWorking(w);
    const g = asGraph(w);
    assertInvariants(g);
    expect(g.segments).toHaveLength(1);
    expect(g.vertices).toHaveLength(2);
  });

  it("drops a rectangle hanging off a path corner", () => {
    const g0 = graphFor(scene2());
    const w = toWorking(g0);
    const src = [...w.vertices.values()].find((v) => v.portId === "s")!;
    const stub = [...w.segments.values()].find(
      (s) => s.a === src.id || s.b === src.id,
    )!;
    const cornerId = stub.a === src.id ? stub.b : stub.a;
    const corner = w.vertices.get(cornerId)!;
    const netId = stub.netId;
    const b = addVertex(w, corner.x + 80, corner.y);
    const c = addVertex(w, corner.x + 80, corner.y - 80);
    const d = addVertex(w, corner.x, corner.y - 80);
    addSegment(w, corner.id, b.id, netId, "h");
    addSegment(w, b.id, c.id, netId, "v");
    addSegment(w, c.id, d.id, netId, "h");
    addSegment(w, d.id, corner.id, netId, "v");
    collapseWorking(w);
    const g = asGraph(w);
    assertInvariants(g);
    expect(g.vertices.some((v) => v.id === b.id)).toBe(false);
    expect(g.vertices.some((v) => v.id === c.id)).toBe(false);
    expect(g.vertices.some((v) => v.id === d.id)).toBe(false);
    expect(g.segments).toHaveLength(3);
    expect(g.vertices.some((v) => v.portId === "s")).toBe(true);
    expect(g.vertices.some((v) => v.portId === "t")).toBe(true);
  });
});

describe("vertical segment drag stays outside machines", () => {
  it("cannot drag a forward V past either min stub", () => {
    const g0 = graphFor(scene2());
    const v0 = g0.segments.find((s) => s.axis === "v")!;
    const src0 = g0.vertices.find((v) => v.portId === "s")!;
    const tgt0 = g0.vertices.find((v) => v.portId === "t")!;
    const left = dragSegment(g0, v0.id, { x: src0.x - 80, y: 120 });
    assertInvariants(left);
    const lv = left.segments.find((s) => s.axis === "v")!;
    const lby = new Map(left.vertices.map((v) => [v.id, v]));
    expect(lby.get(lv.a)!.x).toBeGreaterThanOrEqual(src0.x + MIN_PORT_STUB - 1);
    const right = dragSegment(g0, v0.id, { x: tgt0.x + 80, y: 120 });
    assertInvariants(right);
    const rv = right.segments.find((s) => s.axis === "v")!;
    const rby = new Map(right.vertices.map((v) => [v.id, v]));
    expect(rby.get(rv.a)!.x).toBeLessThanOrEqual(tgt0.x - MIN_PORT_STUB + 1);
  });
});

describe("shift-select same net", () => {
  it("adds a second segment on the same net and ignores a foreign net", () => {
    const g = graphFor(scene2());
    const a = g.segments[0]!;
    const b = g.segments[1]!;
    const one = nextSegmentSelection([], a.id, g.segments, false);
    expect(one).toEqual([a.id]);
    const two = nextSegmentSelection(one, b.id, g.segments, true);
    expect(two).toEqual([a.id, b.id]);
    const off = nextSegmentSelection(two, a.id, g.segments, true);
    expect(off).toEqual([b.id]);
  });
});

describe("prune after machine/port removal", () => {
  it("drops all geometry when the only target is removed", () => {
    const g0 = graphFor(scene2());
    const g = pruneRouteGraph(g0, new Set(["s"]), new Set());
    assertInvariants(g);
    expect(g.segments).toHaveLength(0);
    expect(g.vertices.some((v) => v.portId === "t")).toBe(false);
  });

  it("drops the net when the last inputs of a 1-to-N are removed", () => {
    const g0 = graphFor(scene5());
    const g = pruneRouteGraph(g0, new Set(["s"]), new Set());
    assertInvariants(g);
    expect(g.segments).toHaveLength(0);
  });

  it("keeps the remaining branch when one target of a 1-to-2 is removed", () => {
    const g0 = graphFor(scene5());
    const g = pruneRouteGraph(g0, new Set(["s", "t1"]), new Set(["e1"]));
    assertInvariants(g);
    expect(g.vertices.some((v) => v.portId === "t1")).toBe(true);
    expect(g.vertices.some((v) => v.portId === "t2")).toBe(false);
    expect(g.segments.length).toBeGreaterThan(0);
    expect(g.vertices.some((v) => v.portId === "s")).toBe(true);
  });
});

describe("one-sided nets collapse", () => {
  it("deleting the last output stub wipes the remaining inputs", () => {
    const g0 = graphFor(scene5());
    const src = g0.vertices.find((v) => v.portId === "s")!;
    const stub = g0.segments.find((s) => s.a === src.id || s.b === src.id)!;
    const { graph } = deleteSegment(g0, stub.id, scene5().edges);
    assertInvariants(graph);
    expect(graph.segments).toHaveLength(0);
  });

  it("deleting the last input stub wipes the remaining outputs", () => {
    const g0 = graphFor(scene7());
    const tgt = g0.vertices.find((v) => v.portId === "t")!;
    const stub = g0.segments.find((s) => s.a === tgt.id || s.b === tgt.id)!;
    const { graph } = deleteSegment(g0, stub.id, scene7().edges);
    assertInvariants(graph);
    expect(graph.segments).toHaveLength(0);
  });

  it("drops an input-only component after a split when another component on the same net is still valid", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e1"] });
    const s1 = addPortVertex(w, "s1", 0, 40, "out");
    const t1 = addPortVertex(w, "t1", 200, 40, "in");
    addSegment(w, s1.id, t1.id, netId, "h");
    const s2 = addPortVertex(w, "s2", 0, 160, "out");
    const j = addVertex(w, 80, 160);
    const k = addVertex(w, 80, 240);
    const s3 = addPortVertex(w, "s3", 0, 240, "out");
    addSegment(w, s2.id, j.id, netId, "h");
    addSegment(w, j.id, k.id, netId, "v");
    addSegment(w, k.id, s3.id, netId, "h");
    collapseWorking(w);
    const g = asGraph(w);
    assertInvariants(g);
    expect(g.vertices.some((v) => v.portId === "s1")).toBe(true);
    expect(g.vertices.some((v) => v.portId === "t1")).toBe(true);
    expect(g.vertices.some((v) => v.portId === "s2")).toBe(false);
    expect(g.vertices.some((v) => v.portId === "s3")).toBe(false);
    expect(g.segments.length).toBeGreaterThan(0);
  });
});

describe("bus V drag kinks instead of translating the bus", () => {
  it("moving one V of a 1-to-2 leaves the 3SI in place", () => {
    const g0 = graphFor(scene5());
    const junctions = g0.vertices.filter((v) => v.kind === "3si");
    expect(junctions.length).toBeGreaterThanOrEqual(1);
    const vSeg = g0.segments.find((s) => {
      if (s.axis !== "v") return false;
      const a = g0.vertices.find((v) => v.id === s.a);
      const b = g0.vertices.find((v) => v.id === s.b);
      return a?.kind === "3si" || b?.kind === "3si";
    });
    expect(vSeg).toBeTruthy();
    const busX = g0.vertices.find((v) => v.id === vSeg!.a)!.x;
    const g = dragSegment(g0, vSeg!.id, { x: busX + 48, y: 100 }, { align: false });
    assertInvariants(g);
    for (const j of junctions) {
      const now = g.vertices.find((v) => v.id === j.id);
      if (!now) continue;
      expect(now.x).toBe(j.x);
      expect(now.y).toBe(j.y);
    }
    const moved = g.segments.find((s) => s.id === vSeg!.id);
    expect(moved).toBeTruthy();
    const mx = g.vertices.find((v) => v.id === moved!.a)!.x;
    expect(mx).toBe(busX + 48);
  });

  it("moving one bus V of a 2-to-2 leaves the other bus Vs at the original x", () => {
    const g0 = graphFor(scene8());
    const byId = new Map(g0.vertices.map((v) => [v.id, v]));
    const busVs = g0.segments.filter((s) => {
      if (s.axis !== "v") return false;
      const a = byId.get(s.a);
      const b = byId.get(s.b);
      return a?.kind === "3si" && b?.kind === "3si";
    });
    expect(busVs.length).toBeGreaterThanOrEqual(1);
    const moved = busVs[0]!;
    const busX = byId.get(moved.a)!.x;
    const g = dragSegment(g0, moved.id, { x: busX + 48, y: 120 }, { align: false });
    assertInvariants(g);
    const now = new Map(g.vertices.map((v) => [v.id, v]));
    for (const s of busVs.slice(1)) {
      const a = now.get(s.a);
      const b = now.get(s.b);
      if (!a || !b) continue;
      expect(a.x).toBe(busX);
      expect(b.x).toBe(busX);
    }
    for (const j of g0.vertices.filter((v) => v.kind === "3si")) {
      const v = now.get(j.id);
      if (!v) continue;
      expect(v.x).toBe(j.x);
      expect(v.y).toBe(j.y);
    }
  });
});

describe("alignment snap", () => {
  it("does not snap a V onto an unrelated parallel V", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    w.nets.set("n1", { id: "n1", itemId: "x", edgeIds: ["e1"] });
    w.nets.set("n2", { id: "n2", itemId: "y", edgeIds: ["e2"] });
    const pA = addPortVertex(w, "s1", 0, 40, "out");
    const a = addVertex(w, 100, 40);
    const b = addVertex(w, 100, 200);
    const pB = addPortVertex(w, "t1", 220, 200, "in");
    const pC = addPortVertex(w, "s2", 260, 40, "out");
    const c = addVertex(w, 180, 40);
    const d = addVertex(w, 180, 200);
    const pD = addPortVertex(w, "t2", 40, 200, "in");
    addSegment(w, pA.id, a.id, "n1", "h");
    const v1 = addSegment(w, a.id, b.id, "n1", "v")!;
    addSegment(w, b.id, pB.id, "n1", "h");
    addSegment(w, pC.id, c.id, "n2", "h");
    addSegment(w, c.id, d.id, "n2", "v");
    addSegment(w, d.id, pD.id, "n2", "h");
    const g0 = asGraph(w);
    const g = dragSegment(g0, v1.id, { x: 188, y: 120 });
    const moved = g.segments.find((s) => s.id === v1.id)!;
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    expect(moved).toBeTruthy();
    expect(by.get(moved.a)!.x).toBe(188);
  });

  it("snaps a U-kink's middle H back onto the original line", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e"] });
    const p1 = addPortVertex(w, "s", 0, 40);
    const c1 = addVertex(w, 80, 40);
    const c2 = addVertex(w, 80, 120);
    const c3 = addVertex(w, 220, 120);
    const c4 = addVertex(w, 220, 200);
    const p2 = addPortVertex(w, "t", 400, 200);
    addSegment(w, p1.id, c1.id, netId, "h");
    addSegment(w, c1.id, c2.id, netId, "v");
    const mid = addSegment(w, c2.id, c3.id, netId, "h")!;
    addSegment(w, c3.id, c4.id, netId, "v");
    addSegment(w, c4.id, p2.id, netId, "h");
    const g0 = asGraph(w);
    const g = dragSegment(g0, mid.id, { x: 150, y: 48 });
    assertInvariants(g);
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const topHs = g.segments.filter((s) => {
      if (s.axis !== "h") return false;
      return by.get(s.a)!.y === 40;
    });
    expect(topHs.length).toBeGreaterThan(0);
    const xs = topHs.flatMap((s) => [by.get(s.a)!.x, by.get(s.b)!.x]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
  });

  it("snaps a V through a same-net 3SI to form a 4SI", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e"] });
    const west = addPortVertex(w, "w", 0, 100);
    const j = addVertex(w, 100, 100);
    const east = addPortVertex(w, "e", 220, 100);
    const south = addPortVertex(w, "s", 100, 220);
    addSegment(w, west.id, j.id, netId, "h");
    addSegment(w, j.id, east.id, netId, "h");
    addSegment(w, j.id, south.id, netId, "v");
    const pN = addPortVertex(w, "n", 200, 40);
    const c1 = addVertex(w, 112, 40);
    const c2 = addVertex(w, 112, 100);
    addSegment(w, pN.id, c1.id, netId, "h");
    const v1 = addSegment(w, c1.id, c2.id, netId, "v")!;
    const g0 = asGraph(w);
    expect(countByKind(g0, "3si")).toBeGreaterThanOrEqual(1);
    expect(alignmentTargets(g0, v1.id)).toContain(100);
    const g = dragSegment(g0, v1.id, { x: 108, y: 80 });
    assertInvariants(g);
    expect(countByKind(g, "4si")).toBeGreaterThanOrEqual(1);
  });

  it("align:false leaves the pointer unsnapped", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e"] });
    const p1 = addPortVertex(w, "s", 0, 40);
    const c1 = addVertex(w, 80, 40);
    const c2 = addVertex(w, 80, 120);
    const c3 = addVertex(w, 220, 120);
    const c4 = addVertex(w, 220, 40);
    const p2 = addPortVertex(w, "t", 400, 40);
    addSegment(w, p1.id, c1.id, netId, "h");
    addSegment(w, c1.id, c2.id, netId, "v");
    const mid = addSegment(w, c2.id, c3.id, netId, "h")!;
    addSegment(w, c3.id, c4.id, netId, "v");
    addSegment(w, c4.id, p2.id, netId, "h");
    const g0 = asGraph(w);
    const g = dragSegment(g0, mid.id, { x: 150, y: 48 }, { align: false });
    const moved = g.segments.find((s) => s.id === mid.id)!;
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    expect(by.get(moved.a)!.y).toBe(48);
  });

  it("snaps a V onto a same-net corner in its span", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e"] });
    const p1 = addPortVertex(w, "s", 0, 40, "out");
    const corner = addVertex(w, 80, 40);
    const elbow = addVertex(w, 80, 200);
    const p2 = addPortVertex(w, "t", 400, 200, "in");
    addSegment(w, p1.id, corner.id, netId, "h");
    addSegment(w, corner.id, elbow.id, netId, "v");
    addSegment(w, elbow.id, p2.id, netId, "h");
    const p3 = addPortVertex(w, "s2", 200, 40, "out");
    const c1 = addVertex(w, 92, 40);
    const c2 = addVertex(w, 92, 160);
    const p4 = addPortVertex(w, "t2", 400, 160, "in");
    addSegment(w, p3.id, c1.id, netId, "h");
    const v1 = addSegment(w, c1.id, c2.id, netId, "v")!;
    addSegment(w, c2.id, p4.id, netId, "h");
    const g0 = asGraph(w);
    expect(alignmentTargets(g0, v1.id)).toContain(80);
    const g = dragSegment(g0, v1.id, { x: 88, y: 100 });
    const moved = g.segments.find((s) => s.id === v1.id)!;
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    expect(moved).toBeTruthy();
    expect(by.get(moved.a)!.x).toBe(80);
  });
});

function hRunsThrough(
  g: ReturnType<typeof graphFor>,
  y: number,
  xLo: number,
  xHi: number,
): boolean {
  const by = new Map(g.vertices.map((v) => [v.id, v]));
  return g.segments.some((s) => {
    if (s.axis !== "h") return false;
    const a = by.get(s.a);
    const b = by.get(s.b);
    if (!a || !b) return false;
    if (Math.abs(a.y - y) > 0.5 || Math.abs(b.y - y) > 0.5) return false;
    return Math.min(a.x, b.x) <= xLo + 1 && Math.max(a.x, b.x) >= xHi - 1;
  });
}

describe("reverse wrap on first connect", () => {
  it("addTopologyEdge reverse offset wraps instead of running through the source", () => {
    const ports = [p("s", 400, 40, "out"), p("t", 0, 200, "in")];
    const g = addTopologyEdge(emptyRouteGraph(), ports, e("e1", "s", "t"));
    assertInvariants(g);
    expect(g.segments.length).toBeGreaterThanOrEqual(5);
    expect(hRunsThrough(g, 40, 0, 400)).toBe(false);
    const src = g.vertices.find((v) => v.portId === "s")!;
    const stub = g.segments.find((s) => s.a === src.id || s.b === src.id)!;
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const far = by.get(stub.a === src.id ? stub.b : stub.a)!;
    expect(far.x).toBeGreaterThan(src.x);
  });

  it("addTopologyEdge reverse aligned wraps instead of a through-machine H", () => {
    const ports = [p("s", 400, 100, "out"), p("t", 0, 100, "in")];
    const g = addTopologyEdge(emptyRouteGraph(), ports, e("e1", "s", "t"));
    assertInvariants(g);
    expect(g.segments).toHaveLength(5);
    expect(hRunsThrough(g, 100, 0, 400)).toBe(false);
  });

  it("reverse M-to-N uses a wrap bus, not long Hs through the sources", () => {
    const g = buildRouteGraph(
      [
        p("s1", 400, 40, "out"),
        p("s2", 400, 200, "out"),
        p("t", 0, 120, "in"),
      ],
      [e("e1", "s1", "t"), e("e2", "s2", "t")],
    );
    assertInvariants(g);
    expect(hRunsThrough(g, 40, 0, 400)).toBe(false);
    expect(hRunsThrough(g, 200, 0, 400)).toBe(false);
    expect(g.segments.length).toBeGreaterThanOrEqual(5);
  });
});

describe("illegal inward H fuse", () => {
  function parallelToStub(opts: {
    portX: number;
    portY: number;
    kind: "in" | "out";
    stubX: number;
    freeX: number;
    freeY: number;
  }) {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    const netId = "n1";
    w.nets.set(netId, { id: netId, itemId: "x", edgeIds: ["e"] });
    const port = addPortVertex(w, "p", opts.portX, opts.portY, opts.kind);
    const c1 = addVertex(w, opts.stubX, opts.portY);
    const c2 = addVertex(w, opts.stubX, opts.freeY);
    const c3 = addVertex(w, opts.freeX, opts.freeY);
    const tail = addPortVertex(
      w,
      "t",
      opts.freeX,
      opts.freeY + 40,
      opts.kind === "out" ? "in" : "out",
    );
    addSegment(w, port.id, c1.id, netId, "h");
    addSegment(w, c1.id, c2.id, netId, "v");
    const free = addSegment(w, c2.id, c3.id, netId, "h")!;
    addSegment(w, c3.id, tail.id, netId, "v");
    return { w, port, c1, c2, c3, free, graph: asGraph(w) };
  }

  it("does not snap or fuse an inward H onto an output stub", () => {
    const { graph: g0, free, port } = parallelToStub({
      portX: 0,
      portY: 100,
      kind: "out",
      stubX: 40,
      freeX: -60,
      freeY: 160,
    });
    expect(illegalFuseAlignments(g0, free.id)).toContain(100);
    expect(alignmentTargets(g0, free.id)).not.toContain(100);

    const g = dragSegment(g0, free.id, { x: -10, y: 108 });
    assertInvariants(g);
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const moved = g.segments.find((s) => s.id === free.id);
    expect(moved).toBeTruthy();
    expect(by.get(moved!.a)!.y).not.toBe(100);
    expect(by.get(moved!.b)!.y).not.toBe(100);
    const pv = g.vertices.find((v) => v.portId === "p")!;
    const stub = g.segments.find((s) => s.a === pv.id || s.b === pv.id)!;
    const far = by.get(stub.a === pv.id ? stub.b : stub.a)!;
    expect(far.x).toBeGreaterThanOrEqual(port.x);
    expect(g.vertices.some((v) => v.portId === "p" && v.x === 0)).toBe(true);
  });

  it("skips the coincident Y when the pointer sits on the output stub", () => {
    const { graph: g0, free } = parallelToStub({
      portX: 0,
      portY: 100,
      kind: "out",
      stubX: 40,
      freeX: -60,
      freeY: 160,
    });
    const g = dragSegment(g0, free.id, { x: -10, y: 100 }, { align: false });
    assertInvariants(g);
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const moved = g.segments.find((s) => s.id === free.id)!;
    const y = by.get(moved.a)!.y;
    expect(Math.abs(y - 100)).toBeGreaterThanOrEqual(MIN_SEG);
  });

  it("still fuses an outward H onto the same output stub", () => {
    const { graph: g0, free } = parallelToStub({
      portX: 0,
      portY: 100,
      kind: "out",
      stubX: 40,
      freeX: 200,
      freeY: 160,
    });
    expect(illegalFuseAlignments(g0, free.id)).toHaveLength(0);
    const g = dragSegment(g0, free.id, { x: 120, y: 108 });
    assertInvariants(g);
    const pv = g.vertices.find((v) => v.portId === "p")!;
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const stub = g.segments.find((s) => s.a === pv.id || s.b === pv.id)!;
    expect(by.get(stub.a)!.y).toBe(100);
    expect(by.get(stub.b)!.y).toBe(100);
    const xs = [by.get(stub.a)!.x, by.get(stub.b)!.x];
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(200 - 1);
  });

  it("does not fuse an inward H onto an input stub", () => {
    const { graph: g0, free } = parallelToStub({
      portX: 400,
      portY: 100,
      kind: "in",
      stubX: 360,
      freeX: 460,
      freeY: 160,
    });
    expect(illegalFuseAlignments(g0, free.id)).toContain(100);
    const g = dragSegment(g0, free.id, { x: 430, y: 100 }, { align: false });
    assertInvariants(g);
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const moved = g.segments.find((s) => s.id === free.id)!;
    expect(Math.abs(by.get(moved.a)!.y - 100)).toBeGreaterThanOrEqual(MIN_SEG);
  });

  it("separates an already-coincident inward pair instead of fusing", () => {
    const { w, c2, c3, free } = parallelToStub({
      portX: 0,
      portY: 100,
      kind: "out",
      stubX: 40,
      freeX: -60,
      freeY: 160,
    });
    c2.y = 100;
    c3.y = 100;
    collapseWorking(w);
    const g = asGraph(w);
    assertInvariants(g);
    const by = new Map(g.vertices.map((v) => [v.id, v]));
    const moved = g.segments.find((s) => s.id === free.id);
    expect(moved).toBeTruthy();
    expect(Math.abs(by.get(moved!.a)!.y - 100)).toBeGreaterThanOrEqual(MIN_SEG - 0.5);
    const pv = g.vertices.find((v) => v.portId === "p")!;
    const stub = g.segments.find((s) => s.a === pv.id || s.b === pv.id)!;
    const far = by.get(stub.a === pv.id ? stub.b : stub.a)!;
    expect(far.x).toBeGreaterThanOrEqual(0);
  });
});
