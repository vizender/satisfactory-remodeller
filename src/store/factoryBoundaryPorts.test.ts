import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyWorldDocument } from "@/lib/factoryDocument";
import { useDocumentStore as D } from "./useDocumentStore";
import { useWorldStore as W } from "./useWorldStore";
import {
  ensureBoundaryNodes,
  findFreeBoundaryScreenPosition,
} from "@/lib/factoryBoundaries";

const originalD = D.getState();
const originalW = W.getState();
beforeEach(() => W.getState().replaceWorldDocument(createEmptyWorldDocument()));
afterEach(() => { W.setState(originalW); D.setState(originalD); });

it("starts with no ports, then exposes each explicitly added input and output", () => {
  const id = W.getState().addFactory({ x: 0, y: 0 })!;
  const initialFrame = D.getState().nodes.find((n) => n.id === id)!;
  expect(initialFrame.data.boundary).toMatchObject({ inputs: [], outputs: [] });
  expect(initialFrame.style?.width).toBe(200);
  expect(initialFrame.style?.height).toBe(72);
  W.setState({ activeCanvasId: id });
  W.getState().loadCanvasIntoDocument(id);
  expect(D.getState().nodes.filter((n) => n.type === "boundaryFrame")).toHaveLength(0);
  D.getState().addBoundaryPort("in", { x: 40, y: 80 });
  D.getState().addBoundaryPort("out", { x: 600, y: 80 });
  W.getState().flushActiveCanvas();
  const parent = W.getState().canvasMap.world;
  const frame = parent.nodes.find((n) => n.id === id)!;
  expect(frame.data.boundary).toMatchObject({
    inputs: [{ id: `${id}-in-0`, itemId: "" }],
    outputs: [{ id: `${id}-out-0`, itemId: "" }],
  });
  expect(parent.nodes.filter((n) => n.parentId === id)).toHaveLength(2);
  expect(frame.style?.height).toBe(320);
});

it("keeps the core height and extends the parent frame for more than four ports", () => {
  const id = W.getState().addFactory({ x: 0, y: 0 })!;
  W.setState({ activeCanvasId: id });
  W.getState().loadCanvasIntoDocument(id);
  for (let i = 0; i < 6; i++) D.getState().addBoundaryPort("in", { x: 40, y: i * 112 });
  W.getState().flushActiveCanvas();
  const parent = W.getState().canvasMap.world;
  const frame = parent.nodes.find((n) => n.id === id)!;
  expect(frame.style?.height).toBeGreaterThan(320);
  expect(parent.nodes.filter((n) => n.parentId === id)).toHaveLength(6);
});

it("connects a newly created boundary directly to the matching machine port", () => {
  const id = W.getState().addFactory({ x: 0, y: 0 })!;
  W.setState({ activeCanvasId: id });
  W.getState().loadCanvasIntoDocument(id);
  D.getState().addMachine("Recipe_IngotIron_C", { x: 256, y: 256 });
  const input = D.getState().addConnectedBoundaryPort("in", { x: 32, y: 112 }, "m1-in-0");
  const output = D.getState().addConnectedBoundaryPort("out", { x: 704, y: 112 }, "m1-out-0");
  expect(input).toBe("boundary-in-0");
  expect(output).toBe("boundary-out-0");
  expect(D.getState().edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "boundary-in-0-out-0", target: "m1-in-0" }),
    expect.objectContaining({ source: "m1-out-0", target: "boundary-out-0-in-0" }),
  ]));
  expect(D.getState().nodes.filter((node) => node.parentId?.startsWith("boundary-") && node.type === "itemPort")
    .every((node) => node.data.itemId === "Desc_IronIngot_C" || node.data.itemId === "Desc_OreIron_C")).toBe(true);
  expect(D.getState().routeGraph.nets).toHaveLength(2);
  W.getState().flushActiveCanvas();
  expect(W.getState().canvasMap.world.nodes.filter((node) => node.parentId === id)).toHaveLength(2);
  expect(D.getState().addConnectedBoundaryPort("in", { x: 32, y: 224 }, "m1-out-0")).toBeNull();
});

it("places a new boundary below occupied rows before moving to the next column", () => {
  const button = { left: 16, top: 8, right: 160, bottom: 44 };
  const canvas = { left: 0, top: 0, right: 960, bottom: 450 };
  const occupied = [60, 168, 276].map((top) => ({
    left: 16, top, right: 160, bottom: top + 92,
  }));
  expect(findFreeBoundaryScreenPosition("in", button, canvas, occupied.slice(0, 2), 1))
    .toEqual({ x: 16, y: 276 });
  expect(findFreeBoundaryScreenPosition("in", button, canvas, occupied, 1))
    .toEqual({ x: 176, y: 60 });
  expect(findFreeBoundaryScreenPosition("out", { ...button, left: 800, right: 944 }, canvas, [], 1))
    .toEqual({ x: 800, y: 60 });
  expect(findFreeBoundaryScreenPosition("in", button, canvas, [
    { left: 16, top: 120, right: 144, bottom: 184 },
  ], 1)).toEqual({ x: 16, y: 276 });
});

it("deleting a port removes its parent view and does not auto-create a replacement", () => {
  const id = W.getState().addFactory({ x: 0, y: 0 })!;
  W.setState({ activeCanvasId: id });
  W.getState().loadCanvasIntoDocument(id);
  const portId = D.getState().addBoundaryPort("in", { x: 40, y: 80 });
  D.getState().onNodesChange([{ type: "remove", id: portId }]);
  W.getState().flushActiveCanvas();
  expect(D.getState().nodes.filter((n) => n.type === "boundaryFrame")).toHaveLength(0);
  expect(W.getState().canvasMap.world.nodes.filter((n) => n.parentId === id)).toHaveLength(0);
});

it("removes unused legacy auto-created terminals while retaining wired ones", () => {
  const canvas = {
    id: "f1", name: "Factory", parent: { canvasId: "world", factoryNodeId: "f1" },
    nodes: [
      { id: "boundary-in-0", type: "boundaryFrame", position: { x: 32, y: 64 }, data: { boundaryKind: "in", boundaryIndex: 0 } },
      { id: "boundary-in-0-out-0", type: "itemPort", parentId: "boundary-in-0", position: { x: 0, y: 0 }, data: { itemId: "" } },
    ],
    edges: [], forcedPortRates: {},
  };
  expect(ensureBoundaryNodes(canvas).nodes).toHaveLength(0);
});
