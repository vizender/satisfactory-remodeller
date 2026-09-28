import { afterEach, expect, it } from "vitest";
import { useDocumentStore } from "./useDocumentStore";
import { buildMachineNodes } from "@/lib/buildMachineGraph";
import {
  buildRouteGraph,
  portHandlesFromNodes,
  topologyEdgesFromFlow,
  collectInvariantIssues,
} from "@/lib/routing";

const original = useDocumentStore.getState();
afterEach(() => useDocumentStore.setState(original));

it("remaps matching input/output items and targets when recipe slots change", () => {
  const nodes = buildMachineNodes({
    id: "m1",
    recipeKey: "Recipe_IngotIron_C",
    label: "Iron",
    position: { x: 0, y: 0 },
    operatingMode: "count",
    machineCount: 3,
  });
  // Simulate an old recipe with the shared item in slot 1 and an incompatible slot 0.
  const shared = nodes.find((n) => n.id === "m1-in-0")!;
  shared.id = "m1-in-1";
  shared.data.portIndex = 1;
  nodes.push({
    ...shared,
    id: "m1-in-0",
    data: { ...shared.data, itemId: "unrelated", portIndex: 0 },
  });
  const source = buildMachineNodes({
    id: "m2",
    recipeKey: "Recipe_IngotIron_C",
    label: "Other",
    position: { x: -700, y: 0 },
  });
  source.find((n) => n.id === "m2-out-0")!.data.itemId = shared.data.itemId;
  nodes.push(...source);
  const edges = [
    {
      id: "keep",
      source: "m2-out-0",
      target: shared.id,
      data: { itemId: shared.data.itemId as string },
    },
    {
      id: "drop",
      source: "m2-out-0",
      target: "m1-in-0",
      data: { itemId: "unrelated" },
    },
  ];
  useDocumentStore.setState({
    nodes,
    edges,
    forcedPortRates: { "m1-in-1": 90, "m1-in-0": 42, "m1-out-0": 90 },
    routeGraph: buildRouteGraph(
      portHandlesFromNodes(nodes),
      topologyEdgesFromFlow(edges),
    ),
  });
  useDocumentStore.getState().setMachineRecipe("m1", "Recipe_IngotIron_C");
  const result = useDocumentStore.getState();
  expect(result.edges).toHaveLength(1);
  expect(result.edges[0]).toMatchObject({ id: "keep", target: "m1-in-0" });
  expect(result.forcedPortRates).toEqual({ "m1-in-0": 90, "m1-out-0": 90 });
  expect(result.nodes.find((n) => n.id === "m1")!.data.machineCount).toBe(3);
  expect(
    result.routeGraph.vertices.filter((v) => v.portId).map((v) => v.portId),
  ).toContain("m1-in-0");
  expect(collectInvariantIssues(result.routeGraph)).toEqual([]);
});

it("disconnects only the selected port on a shared wire", () => {
  const nodes = ["m1", "m2", "m3"].flatMap((id, i) =>
    buildMachineNodes({
      id,
      recipeKey: "Recipe_IngotIron_C",
      label: id,
      position: { x: i ? 800 : 0, y: i * 400 },
    }),
  );
  const item = "Desc_IronIngot_C";
  for (const n of nodes.filter((n) => n.type === "itemPort"))
    n.data.itemId = item;
  const edges = [2, 3].map((i) => ({
    id: `e${i}`,
    source: "m1-out-0",
    target: `m${i}-in-0`,
    data: { itemId: item },
  }));
  useDocumentStore.setState({
    nodes,
    edges,
    forcedPortRates: { "m2-in-0": 42 },
    routeGraph: buildRouteGraph(
      portHandlesFromNodes(nodes),
      topologyEdgesFromFlow(edges),
    ),
  });
  useDocumentStore.getState().disconnectPort("m2-in-0");
  const result = useDocumentStore.getState();
  expect(result.edges.map((e) => e.id)).toEqual(["e3"]);
  expect(result.routeGraph.vertices.some((v) => v.portId === "m2-in-0")).toBe(
    false,
  );
  expect(result.forcedPortRates["m2-in-0"]).toBe(42);
  expect(collectInvariantIssues(result.routeGraph)).toEqual([]);
});
