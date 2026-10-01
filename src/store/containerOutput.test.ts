import { afterEach, expect, it } from "vitest";
import { useDocumentStore } from "./useDocumentStore";
import { buildContainerNodes } from "@/lib/buildContainerGraph";
import { buildMachineNodes } from "@/lib/buildMachineGraph";
import { buildRouteGraph, portHandlesFromNodes, topologyEdgesFromFlow } from "@/lib/routing";

const original = useDocumentStore.getState();
afterEach(() => useDocumentStore.setState(original));

it("disconnects and clears forced rates for a disabled container output", () => {
  const container = buildContainerNodes({
    id: "c1", position: { x: 0, y: 0 }, label: "Storage",
    variant: "standard", outputEnabled: true,
    slotItems: ["Desc_IronIngot_C"],
  });
  const machine = buildMachineNodes({
    id: "m1", position: { x: 700, y: 0 }, label: "Iron",
    recipeKey: "Recipe_IronPlate_C",
  });
  const nodes = [...container, ...machine];
  const edges = [{ id: "e1", source: "c1-out-0", target: "m1-in-0", data: { itemId: "Desc_IronIngot_C" } }];
  useDocumentStore.setState({
    nodes, edges, forcedPortRates: { "c1-out-0": 90 },
    routeGraph: buildRouteGraph(portHandlesFromNodes(nodes), topologyEdgesFromFlow(edges)),
  });
  useDocumentStore.getState().setContainerOutputEnabled("c1", false);
  const disabled = useDocumentStore.getState();
  expect(disabled.edges).toEqual([]);
  expect(disabled.forcedPortRates["c1-out-0"]).toBeUndefined();
  expect(disabled.nodes.find((n) => n.id === "c1-out-0")).toBeDefined();
  disabled.setContainerOutputEnabled("c1", true);
  expect(useDocumentStore.getState().nodes.find((n) => n.id === "c1")?.data.outputEnabled).toBe(true);
});
