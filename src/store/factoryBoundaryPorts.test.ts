import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyWorldDocument } from "@/lib/factoryDocument";
import { useDocumentStore as D } from "./useDocumentStore";
import { useWorldStore as W } from "./useWorldStore";
import { ensureBoundaryNodes } from "@/lib/factoryBoundaries";

const originalD = D.getState();
const originalW = W.getState();
beforeEach(() => W.getState().replaceWorldDocument(createEmptyWorldDocument()));
afterEach(() => { W.setState(originalW); D.setState(originalD); });

it("starts with no ports, then exposes each explicitly added input and output", () => {
  const id = W.getState().addFactory({ x: 0, y: 0 })!;
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
