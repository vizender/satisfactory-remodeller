import { afterEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "@/store/useDocumentStore";
import {
  toFactoryDocument,
  parseFactoryDocumentJson,
  loadFactoryDocument,
} from "@/lib/factoryDocument";
import { solveFlow } from "@/lib/flowSolver";
import type { Node, Edge } from "@xyflow/react";

const original = useDocumentStore.getState();
afterEach(() => useDocumentStore.setState(original));

describe("forced rate editing and persistence", () => {
  it("accepts zero and decimal rates, rejects invalid values and clears explicitly", () => {
    useDocumentStore.setState({ forcedPortRates: {} });
    const set = useDocumentStore.getState().setForcedPortRate;
    set("m-out", 12.5);
    for (const invalid of [-1, Infinity, -Infinity, NaN]) {
      set("m-out", invalid);
      expect(useDocumentStore.getState().forcedPortRates["m-out"]).toBe(12.5);
    }
    set("m-out", 0);
    expect(useDocumentStore.getState().forcedPortRates["m-out"]).toBe(0);
    set("m-out", undefined);
    expect(useDocumentStore.getState().forcedPortRates).toEqual({});
  });

  it("keeps overridden requests through JSON export/import", () => {
    const nodes: Node[] = [
      {
        id: "m1",
        type: "machineFrame",
        position: { x: 0, y: 0 },
        data: { label: "source", recipeKey: "test" },
      },
      {
        id: "m1-out-0",
        parentId: "m1",
        type: "itemPort",
        position: { x: 0, y: 0 },
        data: {
          kind: "out",
          portIndex: 0,
          perMinute: 30,
          amountPerCraft: 1,
          slotsOnSide: 1,
          itemId: "iron",
        },
      },
      {
        id: "m2",
        type: "machineFrame",
        position: { x: 500, y: 0 },
        data: { label: "consumer", recipeKey: "test" },
      },
      {
        id: "m2-in-0",
        parentId: "m2",
        type: "itemPort",
        position: { x: 0, y: 0 },
        data: {
          kind: "in",
          portIndex: 0,
          perMinute: 60,
          amountPerCraft: 1,
          slotsOnSide: 1,
          itemId: "iron",
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: "e",
        source: "m1-out-0",
        target: "m2-in-0",
        data: { itemId: "iron" },
      },
    ];
    const forced = { "m2-in-0": 60, "m1-out-0": 10 };
    const saved = JSON.stringify(toFactoryDocument(nodes, edges, forced));
    const loaded = loadFactoryDocument(parseFactoryDocumentJson(saved));
    expect(loaded.forcedPortRates).toEqual(forced);
    const r = solveFlow(loaded.nodes, loaded.edges, loaded.forcedPortRates);
    expect(r.effectiveRate["m1-out-0"]).toBeCloseTo(60);
    expect(r.overriddenPortIds).toEqual(["m1-out-0"]);
    expect(r.hardConflict).toBe(false);
  });
});
