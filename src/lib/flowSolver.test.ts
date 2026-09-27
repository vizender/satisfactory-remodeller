import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { solveFlow } from "@/lib/flowSolver";
import type { ItemPortData, MachineFrameData } from "@/types/graph";

function frame(id: string): Node {
  const data: MachineFrameData = {
    label: id,
    recipeKey: "test",
    clockPercent: 100,
  };
  return {
    id,
    type: "machineFrame",
    position: { x: 0, y: 0 },
    data,
  };
}

function port(
  id: string,
  parentId: string,
  kind: "in" | "out",
  perMinute: number,
  itemId = "Desc_Water_C",
): Node {
  const data: ItemPortData = {
    kind,
    portIndex: 0,
    itemId,
    displayName: itemId,
    perMinute,
    amountPerCraft: 1,
    slotsOnSide: 1,
  };
  return {
    id,
    type: "itemPort",
    parentId,
    position: { x: 0, y: 0 },
    data,
  };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target, data: { itemId: "item" } };
}

function selfLoopGraph() {
  const nodes: Node[] = [
    frame("E"),
    port("E-out", "E", "out", 20),
    frame("P"),
    port("P-in", "P", "in", 30),
    port("P-out", "P", "out", 10),
  ];
  const edges: Edge[] = [
    edge("ext", "E-out", "P-in"),
    edge("loop", "P-out", "P-in"),
  ];
  return { nodes, edges };
}

describe("solveFlow recycle loops", () => {
  it("self-loop: external supplies X − Y, recycle fills Y", () => {
    const { nodes, edges } = selfLoopGraph();
    const r = solveFlow(nodes, edges, {});

    expect(r.machineMultiplier.P).toBeCloseTo(1, 3);
    expect(r.machineMultiplier.E).toBeCloseTo(1, 3);
    expect(r.effectiveRate["P-in"]).toBeCloseTo(30, 3);
    expect(r.edgeFlow.loop).toBeCloseTo(10, 3);
    expect(r.edgeFlow.ext).toBeCloseTo(20, 3);
    expect(r.portDelta["P-in"]).toBeCloseTo(0, 2);
    expect(r.portDelta["E-out"]).toBeCloseTo(0, 2);
    expect(r.portDelta["P-out"]).toBeCloseTo(0, 2);
    expect(r.hardConflict).toBe(false);
  });

  it("self-loop: forced external supply scales the whole loop forward", () => {
    const { nodes, edges } = selfLoopGraph();
    const r = solveFlow(nodes, edges, { "E-out": 30 });

    expect(r.machineMultiplier.P).toBeCloseTo(1.5, 3);
    expect(r.machineMultiplier.E).toBeCloseTo(1.5, 3);
    expect(r.effectiveRate["E-out"]).toBeCloseTo(30, 3);
    expect(r.edgeFlow.loop).toBeCloseTo(15, 3);
    expect(r.edgeFlow.ext).toBeCloseTo(30, 3);
    expect(r.portDelta["P-in"]).toBeCloseTo(0, 2);
    expect(r.portDelta["E-out"]).toBeCloseTo(0, 2);
    expect(r.hardConflict).toBe(false);
  });

  it("two-machine aluminium-style water loop: extractor supplies net 20", () => {
    const nodes: Node[] = [
      frame("E"),
      port("E-out", "E", "out", 20),
      frame("A"),
      port("A-water", "A", "in", 30),
      port("A-prod", "A", "out", 30, "Desc_AluminaSolution_C"),
      frame("B"),
      port("B-prod", "B", "in", 30, "Desc_AluminaSolution_C"),
      port("B-water", "B", "out", 10),
    ];
    const edges: Edge[] = [
      edge("ext", "E-out", "A-water"),
      edge("fwd", "A-prod", "B-prod"),
      edge("rec", "B-water", "A-water"),
    ];
    const r = solveFlow(nodes, edges, {});

    expect(r.machineMultiplier.A).toBeCloseTo(1, 3);
    expect(r.machineMultiplier.B).toBeCloseTo(1, 3);
    expect(r.machineMultiplier.E).toBeCloseTo(1, 3);
    expect(r.edgeFlow.rec).toBeCloseTo(10, 3);
    expect(r.edgeFlow.ext).toBeCloseTo(20, 3);
    expect(r.edgeFlow.fwd).toBeCloseTo(30, 3);
    expect(r.portDelta["A-water"]).toBeCloseTo(0, 2);
    expect(r.portDelta["E-out"]).toBeCloseTo(0, 2);
    expect(r.hardConflict).toBe(false);
  });

  it("non-loop merge of two externals stays proportional", () => {
    const nodes: Node[] = [
      frame("E1"),
      port("E1-out", "E1", "out", 15),
      frame("E2"),
      port("E2-out", "E2", "out", 15),
      frame("P"),
      port("P-in", "P", "in", 30),
    ];
    const edges: Edge[] = [
      edge("a", "E1-out", "P-in"),
      edge("b", "E2-out", "P-in"),
    ];
    const r = solveFlow(nodes, edges, {
      "P-in": 30,
      "E1-out": 15,
      "E2-out": 15,
    });

    expect(r.edgeFlow.a).toBeCloseTo(15, 3);
    expect(r.edgeFlow.b).toBeCloseTo(15, 3);
    expect(r.portDelta["P-in"]).toBeCloseTo(0, 2);
    expect(r.portDelta["E1-out"]).toBeCloseTo(0, 2);
    expect(r.portDelta["E2-out"]).toBeCloseTo(0, 2);
  });
});

/** Iron Wire 12.5 → 22.5, forced 60 ingot → 4.8 machines / 108 wire. */
function ironWireSplitGraph(opts?: { cycleBackToWire?: boolean }) {
  const WIRE = "Desc_Wire_C";
  const PLATE = "Desc_IronPlate_C";
  const INGOT = "Desc_IronIngot_C";
  const STITCHED = "Desc_IronPlateReinforced_C";
  const CABLE = "Desc_Cable_C";

  const nodes: Node[] = [
    frame("W"),
    port("W-in", "W", "in", 12.5, INGOT),
    port("W-out", "W", "out", 22.5, WIRE),
    frame("P"),
    port("P-in", "P", "in", 30, INGOT),
    port("P-out", "P", "out", 20, PLATE),
    frame("A"),
    port("A-plate", "A", "in", 18.75, PLATE),
    port("A-wire", "A", "in", 37.5, WIRE),
    port("A-out", "A", "out", 5.625, STITCHED),
    frame("C"),
    port("C-in", "C", "in", 30, WIRE),
    port("C-out", "C", "out", 10, CABLE),
    frame("SinkC"),
    port("SinkC-in", "SinkC", "in", 10, CABLE),
    frame("SinkA"),
    port("SinkA-in", "SinkA", "in", 5.625, STITCHED),
  ];
  const edges: Edge[] = [
    edge("plate", "P-out", "A-plate"),
    edge("wire-a", "W-out", "A-wire"),
    edge("wire-c", "W-out", "C-in"),
    edge("cable-sink", "C-out", "SinkC-in"),
  ];
  if (opts?.cycleBackToWire) {
    nodes.push(
      frame("X"),
      port("X-in", "X", "in", 5.625, STITCHED),
      port("X-out", "X", "out", 30, INGOT),
    );
    edges.push(
      edge("a-to-x", "A-out", "X-in"),
      edge("x-to-p", "X-out", "P-in"),
    );
  } else {
    edges.push(edge("stitch-sink", "A-out", "SinkA-in"));
  }
  return { nodes, edges };
}

describe("solveFlow balanced splits", () => {
  it("forced 108 wire split 48 + 60 is not a deficit", () => {
    const { nodes, edges } = ironWireSplitGraph();
    const r = solveFlow(nodes, edges, {
      "W-in": 60,
      "SinkC-in": 20,
      "SinkA-in": 7.2,
    });

    expect(r.machineMultiplier.A).toBeCloseTo(1.28, 3);
    expect(r.machineMultiplier.C).toBeCloseTo(2, 3);
    expect(r.effectiveRate["W-out"]).toBeCloseTo(108, 3);
    expect(r.effectiveRate["A-wire"]).toBeCloseTo(48, 3);
    expect(r.effectiveRate["C-in"]).toBeCloseTo(60, 3);
    expect(r.edgeFlow["wire-a"]).toBeCloseTo(48, 3);
    expect(r.edgeFlow["wire-c"]).toBeCloseTo(60, 3);
    expect(r.portDelta["A-wire"]).toBeCloseTo(0, 2);
    expect(r.portDelta["C-in"]).toBeCloseTo(0, 2);
    expect(r.portDelta["W-out"]).toBeCloseTo(0, 2);
    expect(r.portDelta["SinkC-in"]).toBeCloseTo(0, 2);
    expect(r.hardConflict).toBe(false);
  });

  it("same split stays balanced when a downstream cycle exists", () => {
    const { nodes, edges } = ironWireSplitGraph({ cycleBackToWire: true });
    const r = solveFlow(nodes, edges, {
      "W-in": 60,
      "A-wire": 48,
      "C-in": 60,
    });

    expect(r.effectiveRate["W-out"]).toBeCloseTo(108, 3);
    expect(r.effectiveRate["A-wire"]).toBeCloseTo(48, 3);
    expect(r.effectiveRate["C-in"]).toBeCloseTo(60, 3);
    expect(r.edgeFlow["wire-a"]).toBeCloseTo(48, 3);
    expect(r.edgeFlow["wire-c"]).toBeCloseTo(60, 3);
    expect(r.portDelta["A-wire"]).toBeCloseTo(0, 2);
    expect(r.portDelta["C-in"]).toBeCloseTo(0, 2);
    expect(r.hardConflict).toBe(false);
  });

  it("unconsumed split leftover on an output is a surplus", () => {
    const { nodes, edges } = ironWireSplitGraph();
    const r = solveFlow(nodes, edges, {
      "W-in": 60,
      "A-wire": 40,
      "C-in": 60,
    });

    expect(r.effectiveRate["W-out"]).toBeCloseTo(108, 3);
    expect(r.edgeFlow["wire-a"] + r.edgeFlow["wire-c"]).toBeCloseTo(100, 2);
    expect(r.portDelta["W-out"]).toBeCloseTo(8, 2);
    expect(r.hardConflict).toBe(false);
  });

  it("downstream demand overrides an insufficient forced output", () => {
    const { nodes, edges } = ironWireSplitGraph();
    const r = solveFlow(nodes, edges, {
      "W-in": 60,
      "W-out": 50,
      "A-wire": 40,
      "C-in": 60,
    });

    expect(r.effectiveRate["W-out"]).toBeCloseTo(100, 3);
    expect(r.portDelta["W-out"]).toBeCloseTo(0, 2);
    expect(r.overriddenPortIds).toContain("W-out");
    expect(r.hardConflict).toBe(false);
  });
});

function chain() {
  return {
    nodes: [
      frame("A"),
      port("A-out", "A", "out", 60),
      frame("B"),
      port("B-in", "B", "in", 30),
      port("B-out", "B", "out", 15),
      frame("C"),
      port("C-in", "C", "in", 10),
    ],
    edges: [edge("ab", "A-out", "B-in"), edge("bc", "B-out", "C-in")],
  };
}

function expectConservation(
  nodes: Node[],
  edges: Edge[],
  result: ReturnType<typeof solveFlow>,
) {
  for (const value of Object.values(result.machineMultiplier)) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
  for (const n of nodes.filter((n) => n.type === "itemPort")) {
    const d = n.data as ItemPortData;
    const rate = result.effectiveRate[n.id]!;
    expect(Number.isFinite(rate)).toBe(true);
    const flows = edges
      .filter(
        (e) =>
          !e.data?.suggested &&
          (d.kind === "in" ? e.target === n.id : e.source === n.id),
      )
      .map((e) => result.edgeFlow[e.id] ?? 0);
    for (const f of flows) {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
    }
    expect(flows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(rate + 1e-4);
  }
}

describe("bidirectional cascades and downstream priority", () => {
  it.each([{ "B-in": 120 }, { "B-out": 60 }])(
    "a middle port cascades both ways: %j",
    (forced) => {
      const { nodes, edges } = chain();
      const r = solveFlow(nodes, edges, forced);
      expect(r.machineMultiplier).toEqual({ A: 2, B: 4, C: 6 });
      expect(r.hardConflict).toBe(false);
      expectConservation(nodes, edges, r);
    },
  );

  it("backward demand wins regardless of edit, node or edge order", () => {
    const { nodes, edges } = chain();
    for (const forced of [
      { "A-out": 20, "C-in": 40 },
      { "C-in": 40, "A-out": 20 },
    ]) {
      for (const [ns, es] of [
        [nodes, edges],
        [[...nodes].reverse(), [...edges].reverse()],
      ] as [Node[], Edge[]][]) {
        const r = solveFlow(ns, es, forced);
        expect(r.effectiveRate["A-out"]).toBeCloseTo(80);
        expect(r.effectiveRate["C-in"]).toBeCloseTo(40);
        expect(r.overriddenPortIds).toEqual(["A-out"]);
        expect(r.hardConflict).toBe(false);
        expectConservation(nodes, edges, r);
      }
    }
  });

  it("opposing cascades coexist with surplus", () => {
    const { nodes, edges } = chain();
    const r = solveFlow(nodes, edges, { "A-out": 100, "C-in": 40 });
    expect(r.effectiveRate["A-out"]).toBeCloseTo(100);
    expect(r.effectiveRate["C-in"]).toBeCloseTo(40);
    expect(r.portDelta["A-out"]).toBeCloseTo(20);
    expect(r.overriddenPortIds).toEqual([]);
    expect(r.hardConflict).toBe(false);
  });

  it("output goals on the same recipe override incompatible input pins without inventing items", () => {
    const { nodes, edges } = chain();
    const r = solveFlow(nodes, edges, { "B-out": 30, "B-in": 10 });
    expect(r.effectiveRate["B-out"]).toBeCloseTo(30);
    expect(r.effectiveRate["B-in"]).toBeCloseTo(60);
    expect(r.machineMultiplier.B).toBeCloseTo(2);
    expect(r.overriddenPortIds).toEqual(["B-in"]);
    expect(r.hardConflict).toBe(false);
  });

  it("a zero downstream target switches off the upstream chain", () => {
    const { nodes, edges } = chain();
    const r = solveFlow(nodes, edges, { "C-in": 0 });
    expect(Object.values(r.machineMultiplier)).toEqual([0, 0, 0]);
    expect(r.hardConflict).toBe(false);
  });

  it("zero demand permits a pinned upstream surplus", () => {
    const { nodes, edges } = chain();
    const r = solveFlow(nodes, edges, { "C-in": 0, "A-out": 60 });
    expect(r.effectiveRate["A-out"]).toBeCloseTo(60);
    expect(r.effectiveRate["C-in"]).toBe(0);
    expect(r.portDelta["A-out"]).toBeCloseTo(60);
    expect(r.hardConflict).toBe(false);
  });

  it("clock speeds remain part of the recipe ratios", () => {
    const { nodes, edges } = chain();
    (nodes.find((n) => n.id === "B")!.data as MachineFrameData).clockPercent =
      200;
    const r = solveFlow(nodes, edges, { "B-out": 60 });
    expect(r.machineMultiplier.B).toBeCloseTo(2);
    expect(r.effectiveRate["B-in"]).toBeCloseTo(120);
    expect(r.hardConflict).toBe(false);
  });

  it("an unavailable producer reports real deficits without infinity or phantom flow", () => {
    const { nodes, edges } = chain();
    (nodes[0]!.data as MachineFrameData).clockPercent = 0;
    const r = solveFlow(nodes, edges, { "C-in": 40 });
    expect(r.effectiveRate["C-in"]).toBeCloseTo(40);
    expect(r.edgeFlow.ab).toBe(0);
    expect(r.hardConflict).toBe(true);
    expect(r.conflictPortIds.length).toBeGreaterThan(0);
    expectConservation(nodes, edges, r);
  });

  it("a force on a stopped machine is visibly impossible", () => {
    const nodes = [frame("A"), port("A-out", "A", "out", 0)];
    const r = solveFlow(nodes, [], { "A-out": 20 });
    expect(r.effectiveRate["A-out"]).toBe(0);
    expect(r.overriddenPortIds).toContain("A-out");
    expect(r.conflictPortIds).toContain("A-out");
  });

  it("invalid forced values and dangling/suggested links do not poison a plan", () => {
    const { nodes, edges } = chain();
    const forced = {
      "A-out": Infinity,
      "B-in": -10,
      "C-in": NaN,
      missing: 100,
    };
    const es = [
      ...edges,
      edge("dangling", "missing", "C-in"),
      { ...edge("suggestion", "A-out", "C-in"), data: { suggested: true } },
    ];
    expect(solveFlow(nodes, es, forced)).toEqual(solveFlow(nodes, edges, {}));
  });

  it("propagates beyond the old fixed iteration limit", () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    for (let i = 0; i < 80; i++) {
      nodes.push(
        frame(`m${i}`),
        port(`m${i}-in`, `m${i}`, "in", 10),
        port(`m${i}-out`, `m${i}`, "out", 10),
      );
      if (i) edges.push(edge(`e${i}`, `m${i - 1}-out`, `m${i}-in`));
    }
    const r = solveFlow(nodes, edges, { "m79-out": 25 });
    expect(r.effectiveRate["m0-in"]).toBeCloseTo(25);
    expect(r.hardConflict).toBe(false);
    expectConservation(nodes, edges, r);
  });
});

describe("splits and merges", () => {
  it("splits equally in items/min when unconstrained, even with unequal recipes", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 120),
      frame("B"),
      port("b", "B", "in", 30),
      frame("C"),
      port("c", "C", "in", 60),
    ];
    const edges = [edge("b", "a", "b"), edge("c", "a", "c")];
    const r = solveFlow(nodes, edges, { a: 120 });
    expect(r.edgeFlow.b).toBeCloseTo(60);
    expect(r.edgeFlow.c).toBeCloseTo(60);
    expect(r.machineMultiplier.B).toBeCloseTo(2);
    expect(r.machineMultiplier.C).toBeCloseTo(1);
    expect(r.hardConflict).toBe(false);
  });

  it("reserves a forced branch and shares the rest equally", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 120),
      ...["B", "C", "D"].flatMap((id) => [frame(id), port(id, id, "in", 20)]),
    ];
    const edges = ["B", "C", "D"].map((id) => edge(id, "a", id));
    const r = solveFlow(nodes, edges, { a: 120, B: 80 });
    expect(r.edgeFlow.B).toBeCloseTo(80);
    expect(r.edgeFlow.C).toBeCloseTo(20);
    expect(r.edgeFlow.D).toBeCloseTo(20);
    expect(r.hardConflict).toBe(false);
  });

  it("merges equal item rates rather than equal machine multipliers", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      frame("B"),
      port("b", "B", "out", 60),
      frame("C"),
      port("c", "C", "in", 90),
    ];
    const edges = [edge("a", "a", "c"), edge("b", "b", "c")];
    const r = solveFlow(nodes, edges, { c: 90 });
    expect(r.edgeFlow.a).toBeCloseTo(45);
    expect(r.edgeFlow.b).toBeCloseTo(45);
    expect(r.hardConflict).toBe(false);
  });

  it("honors a forced merged supplier and takes the remainder from the other", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      frame("B"),
      port("b", "B", "out", 60),
      frame("C"),
      port("c", "C", "in", 90),
    ];
    const edges = [edge("a", "a", "c"), edge("b", "b", "c")];
    const r = solveFlow(nodes, edges, { c: 90, a: 20 });
    expect(r.edgeFlow.a).toBeCloseTo(20);
    expect(r.edgeFlow.b).toBeCloseTo(70);
    expect(r.overriddenPortIds).toEqual([]);
  });

  it("shared supply across a merge and split is never counted twice", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      frame("B"),
      port("b", "B", "out", 30),
      frame("C"),
      port("c", "C", "in", 30),
      frame("D"),
      port("d", "D", "in", 30),
    ];
    const edges = [
      edge("ac", "a", "c"),
      edge("ad", "a", "d"),
      edge("bc", "b", "c"),
    ];
    const r = solveFlow(nodes, edges, { a: 30, b: 30, c: 30, d: 30 });
    expect(r.edgeFlow.ad).toBeCloseTo(30);
    expect(r.edgeFlow.bc).toBeCloseTo(30);
    expect(r.edgeFlow.ac).toBeCloseTo(0);
    expect(r.hardConflict).toBe(false);
    expectConservation(nodes, edges, r);
  });

  it("co-products allow surplus without flagging compatible downstream targets", () => {
    const nodes = [
      frame("A"),
      port("a1", "A", "out", 10),
      port("a2", "A", "out", 20),
      frame("B"),
      port("b", "B", "in", 10),
      frame("C"),
      port("c", "C", "in", 10),
    ];
    const edges = [edge("b", "a1", "b"), edge("c", "a2", "c")];
    const r = solveFlow(nodes, edges, { b: 10, c: 10 });
    expect(r.portDelta.a2).toBeCloseTo(10);
    expect(r.overriddenPortIds).toEqual([]);
    expect(r.hardConflict).toBe(false);
  });
});

describe("loop conservation and recycling priority", () => {
  it("forced loop demand consumes recycling before fresh input", () => {
    const { nodes, edges } = selfLoopGraph();
    const r = solveFlow(nodes, edges, { "P-in": 60, "E-out": 100 });
    expect(r.edgeFlow.loop).toBeCloseTo(20);
    expect(r.edgeFlow.ext).toBeCloseTo(40);
    expect(r.portDelta["E-out"]).toBeCloseTo(60);
    expect(r.hardConflict).toBe(false);
  });

  it("shares a recycled output across inputs without duplicating its supply", () => {
    const nodes = [
      frame("E"),
      port("e", "E", "out", 20),
      frame("P"),
      port("p1", "P", "in", 20),
      port("p2", "P", "in", 20),
      port("po", "P", "out", 20),
    ];
    const edges = [
      edge("ext1", "e", "p1"),
      edge("ext2", "e", "p2"),
      edge("loop1", "po", "p1"),
      edge("loop2", "po", "p2"),
    ];
    const r = solveFlow(nodes, edges, { p1: 20 });
    expect(r.edgeFlow.loop1 + r.edgeFlow.loop2).toBeCloseTo(20);
    expect(r.edgeFlow.ext1 + r.edgeFlow.ext2).toBeCloseTo(20);
    expect(r.hardConflict).toBe(false);
    expectConservation(nodes, edges, r);
  });

  it("keeps recycling ahead of an optional export branch", () => {
    const { nodes, edges } = selfLoopGraph();
    nodes.push(frame("Sink"), port("sink", "Sink", "in", 10));
    edges.push(edge("export", "P-out", "sink"));
    const r = solveFlow(nodes, edges, { "P-in": 30 });
    expect(r.edgeFlow.loop).toBeCloseTo(10);
    expect(r.edgeFlow.ext).toBeCloseTo(20);
    expect(r.edgeFlow.export).toBeCloseTo(0, 5);
    expect(r.hardConflict).toBe(false);
  });

  it("a closed lossless loop is finite and balanced", () => {
    const nodes = [
      frame("P"),
      port("in", "P", "in", 20),
      port("out", "P", "out", 20),
    ];
    const edges = [edge("loop", "out", "in")];
    const r = solveFlow(nodes, edges, { out: 60 });
    expect(r.edgeFlow.loop).toBeCloseTo(60);
    expect(r.machineMultiplier.P).toBeCloseTo(3);
    expect(r.hardConflict).toBe(false);
  });

  it("a closed lossy loop exposes the unavoidable deficit", () => {
    const nodes = [
      frame("P"),
      port("in", "P", "in", 30),
      port("out", "P", "out", 20),
    ];
    const edges = [edge("loop", "out", "in")];
    const r = solveFlow(nodes, edges, { out: 60 });
    expect(r.edgeFlow.loop).toBeCloseTo(60);
    expect(r.portDelta.in).toBeCloseTo(-30);
    expect(r.conflictPortIds).toEqual(["in"]);
    expect(r.hardConflict).toBe(true);
    expectConservation(nodes, edges, r);
  });
});

function container(id: string, outputEnabled = true): Node[] {
  return [
    {
      id,
      type: "containerFrame",
      position: { x: 0, y: 0 },
      data: {
        label: id,
        variant: "standard",
        outputEnabled,
        buildingClassId: "test",
      },
    },
    port(`${id}-in-0`, id, "in", 0),
    port(`${id}-out-0`, id, "out", 0),
  ];
}

describe("containers in cascades", () => {
  it("propagates demand through multiple containers in either node order", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      ...container("C1"),
      ...container("C2"),
      frame("B"),
      port("b", "B", "in", 30),
    ];
    const edges = [
      edge("in", "a", "C1-in-0"),
      edge("pass", "C1-out-0", "C2-in-0"),
      edge("out", "C2-out-0", "b"),
    ];
    for (const ns of [nodes, [...nodes].reverse()]) {
      const r = solveFlow(ns, edges, { b: 60 });
      expect(r.effectiveRate.a).toBeCloseTo(60);
      expect(r.edgeFlow.pass).toBeCloseTo(60);
      expect(r.portStoredPerMin).toEqual({});
      expect(r.hardConflict).toBe(false);
      expectConservation(nodes, edges, r);
    }
  });

  it("stores excess forced supply without creating a deficit", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      ...container("C"),
      frame("B"),
      port("b", "B", "in", 30),
    ];
    const edges = [edge("in", "a", "C-in-0"), edge("out", "C-out-0", "b")];
    const r = solveFlow(nodes, edges, { a: 90, b: 60 });
    expect(r.portStoredPerMin["C-in-0"]).toBeCloseTo(30);
    expect(r.hardConflict).toBe(false);
  });

  it("allows a container output target to size the producer", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      ...container("C"),
      frame("B"),
      port("b", "B", "in", 30),
    ];
    const edges = [edge("in", "a", "C-in-0"), edge("out", "C-out-0", "b")];
    const r = solveFlow(nodes, edges, { "C-out-0": 75 });
    expect(r.effectiveRate.a).toBeCloseTo(75);
    expect(r.effectiveRate.b).toBeCloseTo(75);
    expect(r.hardConflict).toBe(false);
  });

  it("a disabled output cannot supply downstream demand", () => {
    const nodes = [
      frame("A"),
      port("a", "A", "out", 30),
      ...container("C", false),
      frame("B"),
      port("b", "B", "in", 30),
    ];
    const edges = [edge("in", "a", "C-in-0"), edge("out", "C-out-0", "b")];
    const r = solveFlow(nodes, edges, { b: 60 });
    expect(r.edgeFlow.out).toBe(0);
    expect(r.hardConflict).toBe(true);
    expect(r.portDelta.b).toBeCloseTo(-60);
  });
});

it("conserves flow in varied cyclic networks with simultaneous splits and merges", () => {
  let seed = 7391;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let sample = 0; sample < 24; sample++) {
    const count = 4 + (sample % 5);
    const links: { from: number; to: number; rate: number }[] = [];
    for (let i = 0; i < count; i++)
      links.push({ from: i, to: (i + 1) % count, rate: 1 + random() * 100 });
    for (let i = 0; i < count; i++)
      links.push({
        from: Math.floor(random() * count),
        to: Math.floor(random() * count),
        rate: random() * 50,
      });
    const nodes = Array.from({ length: count }, (_, i) => [
      frame(`m${i}`),
      port(
        `m${i}-in`,
        `m${i}`,
        "in",
        links.filter((e) => e.to === i).reduce((s, e) => s + e.rate, 0),
      ),
      port(
        `m${i}-out`,
        `m${i}`,
        "out",
        links.filter((e) => e.from === i).reduce((s, e) => s + e.rate, 0),
      ),
    ]).flat();
    const edges = links.map((e, i) =>
      edge(`e${i}`, `m${e.from}-out`, `m${e.to}-in`),
    );
    const out = nodes.find((n) => n.id === "m0-out")!;
    const rate = (out.data as ItemPortData).perMinute * 1.7;
    const r = solveFlow(nodes, edges, { "m0-out": rate });
    expect(r.hardConflict, `network ${sample}`).toBe(false);
    expect(r.effectiveRate["m0-out"]).toBeCloseTo(rate, 3);
    expectConservation(nodes, edges, r);
    for (const n of nodes.filter(
      (n) => n.type === "itemPort" && n.data.kind === "in",
    )) {
      expect(r.portDelta[n.id]).toBeCloseTo(0, 3);
    }
  }
});
