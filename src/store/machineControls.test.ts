import { afterEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "./useDocumentStore";
import { buildMachineNodes } from "@/lib/buildMachineGraph";
import { solveFlow } from "@/lib/flowSolver";
import { emptyRouteGraph } from "@/lib/routing";
import {
  parseFactoryDocumentJson,
  toFactoryDocument,
  loadFactoryDocument,
} from "@/lib/factoryDocument";

const original = useDocumentStore.getState();
afterEach(() => useDocumentStore.setState(original));
function setup(forced = true) {
  useDocumentStore.setState({
    nodes: buildMachineNodes({
      id: "m1",
      recipeKey: "Recipe_IngotIron_C",
      label: "Iron",
      position: { x: 0, y: 0 },
    }),
    edges: [],
    forcedPortRates: forced ? { "m1-out-0": 300 } : {},
    routeGraph: emptyRouteGraph(),
  });
}
function solve() {
  const s = useDocumentStore.getState();
  return solveFlow(s.nodes, s.edges, s.forcedPortRates);
}

describe("machine count and clock controls", () => {
  it("caps an insufficient count silently at the exact 250% operating point", () => {
    setup();
    useDocumentStore.getState().setMachineCount("m1", 1);
    const result = solve();
    expect(result.effectiveRate["m1-out-0"]).toBeCloseTo(300);
    expect(result.machineMultiplier.m1).toBeCloseTo(4);
    expect(result.machineClockPercent.m1).toBeCloseTo(250);
    expect(result.hardConflict).toBe(false);
    expect(useDocumentStore.getState().nodes[0].data.machineCount).toBeCloseTo(
      4,
    );
  });
  it("lets the last control edited determine the operating point without changing throughput", () => {
    setup();
    useDocumentStore.getState().setMachineCount("m1", 8);
    expect(solve().machineClockPercent.m1).toBeCloseTo(125);
    useDocumentStore.getState().setMachineClockPercent("m1", 80);
    expect(solve().machineMultiplier.m1).toBeCloseTo(12.5);
    useDocumentStore.getState().setMachineCount("m1", 7);
    expect(solve().machineClockPercent.m1).toBeCloseTo(1000 / 7);
    expect(solve().effectiveRate["m1-out-0"]).toBeCloseTo(300);
  });
  it("preserves unforced throughput and resumes after a zero-clock stop", () => {
    setup(false);
    useDocumentStore.getState().setMachineCount("m1", 4);
    expect(solve().machineClockPercent.m1).toBeCloseTo(25);
    useDocumentStore.getState().setMachineClockPercent("m1", 50);
    expect(solve().machineMultiplier.m1).toBeCloseTo(2);
    expect(solve().effectiveRate["m1-out-0"]).toBeCloseTo(30);
    useDocumentStore.getState().setMachineClockPercent("m1", 0);
    expect(solve().effectiveRate["m1-out-0"]).toBe(0);
    useDocumentStore.getState().setMachineClockPercent("m1", 10);
    expect(solve().effectiveRate["m1-out-0"]).toBeCloseTo(30);
  });
  it("retains count preference across export/import and rejects invalid numbers", () => {
    setup();
    useDocumentStore.getState().setMachineCount("m1", 7);
    for (const value of [-1, NaN, Infinity])
      useDocumentStore.getState().setMachineCount("m1", value);
    const s = useDocumentStore.getState();
    const loaded = loadFactoryDocument(
      parseFactoryDocumentJson(
        JSON.stringify(toFactoryDocument(s.nodes, s.edges, s.forcedPortRates)),
      ),
    );
    const result = solveFlow(
      loaded.nodes,
      loaded.edges,
      loaded.forcedPortRates,
    );
    expect(result.machineMultiplier.m1).toBeCloseTo(7);
    expect(result.machineClockPercent.m1).toBeCloseTo(1000 / 7);
  });
});

describe("miner modifiers", () => {
  it("combines tier, purity, and overclock on one miner", () => {
    useDocumentStore.setState({
      nodes: buildMachineNodes({
        id: "miner",
        recipeKey: "Synthetic_MinerMk1_IronOre_C",
        label: "Miner",
        position: { x: 0, y: 0 },
      }),
      edges: [],
      forcedPortRates: {},
      routeGraph: emptyRouteGraph(),
    });
    expect(solve().effectiveRate["miner-out-0"]).toBeCloseTo(60);
    useDocumentStore.getState().setMinerPurity("miner", "impure");
    expect(solve().effectiveRate["miner-out-0"]).toBeCloseTo(30);
    useDocumentStore.getState().setMinerPurity("miner", "pure");
    expect(solve().effectiveRate["miner-out-0"]).toBeCloseTo(120);
    useDocumentStore.getState().setMinerMk("miner", 2);
    expect(solve().effectiveRate["miner-out-0"]).toBeCloseTo(240);
    useDocumentStore.getState().setMachineClockPercent("miner", 200);
    const result = solve();
    expect(result.machineMultiplier.miner).toBeCloseTo(1);
    expect(result.effectiveRate["miner-out-0"]).toBeCloseTo(480);
    useDocumentStore.getState().setMinerMk("miner", 3);
    expect(solve().effectiveRate["miner-out-0"]).toBeCloseTo(960);
    useDocumentStore.getState().setMachineClockPercent("miner", 0);
    expect(solve().effectiveRate["miner-out-0"]).toBe(0);
    useDocumentStore.getState().setMachineClockPercent("miner", 200);
    expect(solve().effectiveRate["miner-out-0"]).toBeCloseTo(960);
  });
});
