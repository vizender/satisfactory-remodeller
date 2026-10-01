import { expect, it } from "vitest";
import { buildMachineNodes } from "./buildMachineGraph";
import { buildRouteGraph, portHandlesFromNodes, topologyEdgesFromFlow } from "./routing";
import { wrapCanvasSelection } from "./wrapCanvasSelection";
import { captureCanvasSelection, pasteCanvasSelection, cutCanvasSelection } from "./canvasClipboard";
import type { CanvasRecord } from "@/types/canvas";

function fixture() {
  const nodes = ["m1", "m2", "m3"].flatMap((id, i) => buildMachineNodes({
    id, label: id,
    recipeKey: ["Recipe_IngotIron_C", "Recipe_IronPlate_C", "Recipe_IronPlateReinforced_C"][i],
    position: { x: i * 640, y: 100 },
  }));
  const edges = [
    { id: "internal", source: "m1-out-0", target: "m2-in-0", data: { itemId: "Desc_IronIngot_C" } },
    { id: "external", source: "m2-out-0", target: "m3-in-0", data: { itemId: "Desc_IronPlate_C" } },
  ];
  return { world: {
    id: "world", name: "World", nodes, edges,
    forcedPortRates: { "m1-out-0": 90, "m3-out-0": 45 },
    routeGraph: buildRouteGraph(portHandlesFromNodes(nodes), topologyEdgesFromFlow(edges)),
  } satisfies CanvasRecord };
}

it.each(["factory", "blueprint"] as const)("moves connected machines into a new %s and cuts exterior wires", (kind) => {
  const result = wrapCanvasSelection(fixture(), {}, "world", new Set(["m1", "m2"]), kind, "Group")!;
  const parent = result.canvases.world;
  const child = result.canvases[result.id];
  expect(parent.nodes.filter((n) => n.type === "machineFrame")).toHaveLength(1);
  expect(parent.edges).toHaveLength(0);
  expect(child.nodes.filter((n) => n.type === "machineFrame")).toHaveLength(2);
  expect(child.edges).toHaveLength(1);
  expect(Object.values(child.forcedPortRates)).toContain(90);
  expect(parent.forcedPortRates["m3-out-0"]).toBe(45);
  expect(child.kind === "blueprint").toBe(kind === "blueprint");
  if (kind === "blueprint") expect(result.library[child.blueprintId!]).toBeDefined();
});

it("copies and cuts selected machines across canvases, including into a blueprint", () => {
  const map = fixture();
  const target: CanvasRecord = {
    id: "f1", name: "Target", kind: "blueprint",
    parent: { canvasId: "world", factoryNodeId: "f1" },
    nodes: [], edges: [], forcedPortRates: {},
  };
  map.world.nodes = map.world.nodes.map((n) => ({ ...n, selected: n.id === "m1" || n.id === "m2" }));
  const canvases = { ...map, f1: target };
  const clip = captureCanvasSelection(canvases, "world")!;
  const cut = cutCanvasSelection(canvases, "world");
  const pasted = pasteCanvasSelection(cut, "f1", clip, { x: -500, y: 100 });
  expect(pasted.world.nodes.filter((n) => n.type === "machineFrame")).toHaveLength(1);
  expect(pasted.f1.nodes.filter((n) => n.type === "machineFrame")).toHaveLength(2);
  expect(pasted.f1.edges).toHaveLength(1);
});
