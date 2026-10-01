import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCanvasHistory } from "./canvasHistory";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useWorldStore } from "@/store/useWorldStore";
import { createEmptyWorldDocument } from "./factoryDocument";
import {
  captureCanvasSelection,
  cutCanvasSelection,
  pasteCanvasSelection,
} from "./canvasClipboard";

const originalDoc = useDocumentStore.getState();
const originalWorld = useWorldStore.getState();
let history: ReturnType<typeof createCanvasHistory>;
const doc = () => useDocumentStore.getState();
const world = () => useWorldStore.getState();
beforeEach(() => {
  world().replaceWorldDocument(createEmptyWorldDocument());
  history = createCanvasHistory();
});
afterEach(() => {
  history.dispose();
  useDocumentStore.setState(originalDoc);
  useWorldStore.setState(originalWorld);
  vi.useRealTimers();
});
const add = () => {
  doc().addMachine("Recipe_IngotIron_C", { x: 0, y: 0 });
  history.flush();
};

it("undoes and redoes adding machines and clears redo after a new edit", () => {
  add();
  expect(history.undo()).toBe(true);
  expect(doc().nodes).toEqual([]);
  expect(history.redo()).toBe(true);
  expect(doc().nodes.some((n) => n.id === "m1")).toBe(true);
  history.undo();
  doc().addContainer("industrial", { x: 0, y: 0 });
  expect(history.redo()).toBe(false);
});

it("restores a deleted machine with its wires, geometry and forced rates", () => {
  add();
  doc().addMachine(
    "Recipe_IronPlate_C",
    { x: 800, y: 0 },
    { linkOriginPortId: "m1-out-0" },
  );
  doc().setForcedPortRate("m1-out-0", 90);
  history.flush();
  const edges = structuredClone(doc().edges);
  const graph = structuredClone(doc().routeGraph);
  expect(edges).toHaveLength(1);
  doc().removeMachine("m1");
  expect(history.undo()).toBe(true);
  expect(doc().edges).toEqual(edges);
  expect(doc().routeGraph).toEqual(graph);
  expect(doc().forcedPortRates["m1-out-0"]).toBe(90);
  doc().disconnectPort("m1-out-0");
  history.flush();
  expect(doc().edges).toEqual([]);
  history.undo();
  expect(doc().edges).toEqual(edges);
});

it("groups a long drag and final wire adjustments into one undo step", () => {
  vi.useFakeTimers();
  add();
  const position = { ...doc().nodes[0].position };
  history.beginGesture();
  for (let i = 1; i <= 20; i++) {
    doc().onNodesChange([
      {
        type: "position",
        id: "m1",
        position: { x: i * 16, y: 64 },
        dragging: true,
      },
    ]);
    history.flush();
  }
  history.endGesture();
  doc().onNodesChange([
    {
      type: "position",
      id: "m1",
      position: { x: 320, y: 64 },
      dragging: false,
    },
  ]);
  vi.runAllTimers();
  history.undo();
  expect(doc().nodes[0].position).toEqual(position);
  history.undo();
  expect(doc().nodes).toEqual([]);
});

it("ignores selection, measurements and view changes", () => {
  add();
  doc().onNodesChange([
    { type: "select", id: "m1", selected: true },
    { type: "dimensions", id: "m1", dimensions: { width: 544, height: 320 } },
  ]);
  world().setActiveCanvasViewport({ x: 100, y: 200, zoom: 0.8 });
  history.flush();
  history.undo();
  expect(doc().nodes).toEqual([]);
  expect(world().canvasMap.world.viewport).toEqual({
    x: 100,
    y: 200,
    zoom: 0.8,
  });
});

it("restores a removed factory subtree and undoes edits across canvas navigation", async () => {
  const id = world().addFactory({ x: 0, y: 0 })!;
  history.flush();
  const navigation = world().navigateToCanvas(id);
  history.flush();
  add();
  doc().setMachineCount("m1", 4);
  history.flush();
  void world().navigateToCanvas("world");
  history.flush();
  world().removeFactory(id);
  history.undo();
  expect(
    world().canvasMap[id].nodes.find((n) => n.id === "m1")?.data.machineCount,
  ).toBe(4);
  history.undo();
  expect(world().activeCanvasId).toBe(id);
  expect(
    doc().nodes.find((n) => n.id === "m1")?.data.machineCount,
  ).toBeUndefined();
  history.undo();
  expect(doc().nodes.filter((n) => n.type === "machineFrame")).toEqual([]);
  expect(doc().nodes.filter((n) => n.type === "boundaryFrame")).toHaveLength(0);
  await navigation;
});

it("undoes world imports and grouped clipboard mutations as single actions", () => {
  add();
  doc().onNodesChange([{ type: "select", id: "m1", selected: true }]);
  world().flushActiveCanvas();
  const clipboard = captureCanvasSelection(world().canvasMap, "world")!;
  useWorldStore.setState({
    canvasMap: cutCanvasSelection(world().canvasMap, "world"),
  });
  world().loadCanvasIntoDocument("world");
  history.undo();
  expect(doc().nodes.some((n) => n.id === "m1")).toBe(true);
  world().flushActiveCanvas();
  useWorldStore.setState({
    canvasMap: pasteCanvasSelection(world().canvasMap, "world", clipboard),
  });
  world().loadCanvasIntoDocument("world");
  history.flush();
  expect(doc().nodes.filter((n) => !n.parentId)).toHaveLength(2);
  history.undo();
  expect(doc().nodes.filter((n) => !n.parentId)).toHaveLength(1);
  world().replaceWorldDocument(createEmptyWorldDocument());
  history.undo();
  expect(doc().nodes.filter((n) => !n.parentId)).toHaveLength(1);
});

it("records separate settled edits without explicit checkpoints", async () => {
  doc().addContainer("standard", { x: 0, y: 0 });
  await Promise.resolve();
  doc().setContainerOutputEnabled("c1", false);
  await Promise.resolve();
  history.undo();
  expect(doc().nodes[0].data.outputEnabled).toBe(true);
  history.undo();
  expect(doc().nodes).toEqual([]);
});

it("supports repeated undo/redo of independent edits and stops at history boundaries", () => {
  add();
  doc().setForcedPortRate("m1-out-0", 90);
  history.flush();
  doc().setMachineCount("m1", 4);
  history.flush();
  for (let cycle = 0; cycle < 2; cycle++) {
    expect(history.undo()).toBe(true);
    expect(doc().nodes[0].data.machineCount).toBeUndefined();
    expect(history.undo()).toBe(true);
    expect(doc().forcedPortRates).toEqual({});
    expect(history.undo()).toBe(true);
    expect(doc().nodes).toEqual([]);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(doc().nodes.some((n) => n.id === "m1")).toBe(true);
    expect(history.redo()).toBe(true);
    expect(doc().forcedPortRates["m1-out-0"]).toBe(90);
    expect(history.redo()).toBe(true);
    expect(doc().nodes[0].data.machineCount).toBe(4);
    expect(history.redo()).toBe(false);
  }
});
