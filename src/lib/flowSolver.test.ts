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

  it("self-loop: forced external above net need stays surplus on its output", () => {
    const { nodes, edges } = selfLoopGraph();
    const r = solveFlow(nodes, edges, { "E-out": 30 });

    expect(r.machineMultiplier.P).toBeCloseTo(1, 3);
    expect(r.machineMultiplier.E).toBeCloseTo(1.5, 3);
    expect(r.effectiveRate["E-out"]).toBeCloseTo(30, 3);
    expect(r.edgeFlow.loop).toBeCloseTo(10, 3);
    expect(r.edgeFlow.ext).toBeCloseTo(20, 3);
    expect(r.portDelta["P-in"]).toBeCloseTo(0, 2);
    expect(r.portDelta["E-out"]).toBeCloseTo(10, 2);
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
