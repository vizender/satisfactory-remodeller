import { describe, expect, it } from "vitest";
import { buildMachineNodes } from "./buildMachineGraph";
import {
  captureCanvasSelection,
  cutCanvasSelection,
  pasteCanvasSelection,
} from "./canvasClipboard";
import {
  buildRouteGraph,
  portHandlesFromNodes,
  topologyEdgesFromFlow,
  collectInvariantIssues,
} from "./routing";
import type { CanvasRecord } from "@/types/canvas";

function fixture(): Record<string, CanvasRecord> {
  const nodes = ["m1", "m2", "m3"].flatMap((id, i) =>
    buildMachineNodes({
      id,
      label: id,
      recipeKey: "Recipe_IngotIron_C",
      position: { x: i * 800, y: 0 },
      operatingMode: "count",
      machineCount: 3,
    }),
  );
  for (const n of nodes) {
    n.selected = n.id === "m1" || n.id === "m2";
    if (n.type === "itemPort") n.data.itemId = "iron";
  }
  const edges = [1, 2].map((i) => ({
    id: `e${i}`,
    source: `m${i}-out-0`,
    target: `m${i + 1}-in-0`,
    data: { itemId: "iron" },
  }));
  nodes.push({
    id: "f1",
    type: "factoryFrame",
    selected: true,
    position: { x: 0, y: 600 },
    data: { label: "Factory" },
  });
  return {
    world: {
      id: "world",
      name: "World",
      nodes,
      edges,
      forcedPortRates: { "m1-out-0": 90, "m3-out-0": 50 },
      routeGraph: buildRouteGraph(
        portHandlesFromNodes(nodes),
        topologyEdgesFromFlow(edges),
      ),
    },
    f1: {
      id: "f1",
      name: "Factory",
      parent: { canvasId: "world", factoryNodeId: "f1" },
      nodes: [
        {
          id: "f2",
          type: "factoryFrame",
          position: { x: 0, y: 0 },
          data: { label: "Nested" },
        },
      ],
      edges: [],
      forcedPortRates: {},
    },
    f2: {
      id: "f2",
      name: "Nested",
      parent: { canvasId: "f1", factoryNodeId: "f2" },
      nodes: buildMachineNodes({
        id: "m1",
        label: "Old import reusing an ID",
        recipeKey: "Recipe_IngotIron_C",
        position: { x: 0, y: 0 },
      }),
      edges: [],
      forcedPortRates: { "m1-out-0": 150 },
    },
  };
}

describe("canvas clipboard", () => {
  it("copies a connected group and nested factories with fresh ids, settings and geometry", () => {
    const initial = fixture();
    const clip = captureCanvasSelection(initial, "world")!;
    const pasted = pasteCanvasSelection(initial, "world", clip);
    expect(pasted.world.nodes.filter((n) => n.selected)).toHaveLength(3);
    expect(pasted.world.edges).toHaveLength(3);
    const selected = pasted.world.nodes.filter(
      (n) => n.selected && n.type === "machineFrame",
    );
    expect(selected.map((n) => n.data.machineCount)).toEqual([3, 3]);
    expect(selected[0].position).toEqual({ x: 64, y: 64 });
    const allIds = Object.values(pasted)
      .filter((c) => !["f1", "f2"].includes(c.id))
      .flatMap((c) => c.nodes.map((n) => n.id));
    expect(new Set(allIds).size).toBe(allIds.length);
    const factory = pasted.world.nodes.find(
      (n) => n.selected && n.type === "factoryFrame",
    )!;
    const child = pasted[factory.id];
    expect(child.parent?.canvasId).toBe("world");
    const nested = pasted[child.nodes[0].id];
    expect(nested.parent?.canvasId).toBe(child.id);
    expect(Object.values(nested.forcedPortRates)).toEqual([150]);
    const originalGraph = initial.world.routeGraph!;
    const copiedVertices = pasted.world.routeGraph!.vertices.slice(
      originalGraph.vertices.length,
    );
    const clipVertices = clip.root.routeGraph!.vertices;
    expect(copiedVertices.map((v) => [v.x, v.y])).toEqual(
      clipVertices.map((v) => [v.x + 64, v.y + 64]),
    );
    expect(collectInvariantIssues(pasted.world.routeGraph!)).toEqual([]);
    const twice = pasteCanvasSelection(pasted, "world", clip);
    const ids = twice.world.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("cuts selected objects and their incident connections, retaining a reusable snapshot", () => {
    const initial = fixture();
    const clip = captureCanvasSelection(initial, "world")!;
    const cut = cutCanvasSelection(initial, "world");
    expect(Object.keys(cut)).toEqual(["world"]);
    expect(cut.world.nodes.filter((n) => !n.parentId).map((n) => n.id)).toEqual(
      ["m3"],
    );
    expect(cut.world.edges).toEqual([]);
    expect(cut.world.routeGraph!.segments).toEqual([]);
    expect(cut.world.forcedPortRates).toEqual({ "m3-out-0": 50 });
    const restored = pasteCanvasSelection(cut, "world", clip);
    expect(restored.world.edges).toHaveLength(1);
    expect(Object.keys(restored)).toHaveLength(3);
  });
  it("copies wires with their endpoints but only cuts explicitly selected objects", () => {
    const initial = fixture();
    initial.world.nodes.forEach((n) => {
      n.selected = false;
    });
    const selected = new Set(["e1"]);
    const clip = captureCanvasSelection(initial, "world", selected)!;
    expect(clip.root.nodes.filter((n) => !n.parentId).map((n) => n.id)).toEqual(
      ["m1", "m2"],
    );
    const cut = cutCanvasSelection(initial, "world", selected);
    expect(cut.world.nodes).toHaveLength(initial.world.nodes.length);
    expect(cut.world.edges.map((e) => e.id)).toEqual(["e2"]);
  });
});
