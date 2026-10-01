import { afterEach, beforeEach, expect, it } from "vitest";
import { useDocumentStore as D } from "./useDocumentStore";
import { useWorldStore as W } from "./useWorldStore";
import {
  createEmptyWorldDocument,
  parseFactoryDocumentJson,
} from "@/lib/factoryDocument";
import { createCanvasHistory } from "@/lib/canvasHistory";
import { subscribeFactorySynchronization } from "@/hooks/useFactorySynchronization";
import { computeFactoryHierarchy } from "@/lib/factoryHierarchy";
import { parseBlueprint, exportBlueprint } from "@/lib/blueprints";
import {
  buildCanvasSubtreeExport,
  mergeImportedSubtree,
} from "@/lib/canvasExport";

const originalD = D.getState(),
  originalW = W.getState();
let unsubscribe: () => void;
let history: ReturnType<typeof createCanvasHistory>;
beforeEach(() => {
  W.getState().replaceWorldDocument(createEmptyWorldDocument());
  unsubscribe = subscribeFactorySynchronization();
  history = createCanvasHistory();
});
afterEach(() => {
  history.dispose();
  unsubscribe();
  W.setState(originalW);
  D.setState(originalD);
});
function enter(id: string) {
  W.getState().flushActiveCanvas();
  W.setState({ activeCanvasId: id });
  W.getState().loadCanvasIntoDocument(id);
}
function makeBlueprint() {
  const id = W.getState().createBlueprint({ x: 0, y: 0 }, "Iron")!;
  enter(id);
  D.getState().addMachine("Recipe_IngotIron_C", { x: 256, y: 256 });
  D.getState().onConnect({
    source: "boundary-in-0-out-0",
    target: "m1-in-0",
    sourceHandle: "item",
    targetHandle: "item",
  });
  D.getState().onConnect({
    source: "m1-out-0",
    target: "boundary-out-0-in-0",
    sourceHandle: "item",
    targetHandle: "item",
  });
  enter("world");
  return id;
}

it("preserves independent instances, library revisions, fractional rates and undo/redo", () => {
  const id = makeBlueprint();
  const bp = W.getState().canvasMap[id].blueprintId!;
  const copy = W.getState().addBlueprint(bp, { x: 800, y: 0 })!;
  D.getState().setForcedPortRate(`${copy}-out-0`, 75);
  expect(
    computeFactoryHierarchy(W.getState().canvasMap).results.world
      .machineMultiplier[copy],
  ).toBeCloseTo(2.5);
  enter(id);
  history.flush();
  const revision = W.getState().blueprintLibrary[bp].revision;
  D.getState().setForcedPortRate("m1-out-0", 90);
  history.flush();
  expect(W.getState().blueprintLibrary[bp].revision).toBe(revision + 1);
  expect(
    W.getState().canvasMap[copy].forcedPortRates["m1-out-0"],
  ).toBeUndefined();
  expect(
    W.getState().canvasMap.world.nodes.find((n) => n.id === copy)?.data
      .blueprintOutdated,
  ).toBe(true);
  expect(history.undo()).toBe(true);
  expect(W.getState().blueprintLibrary[bp].revision).toBe(revision);
  expect(D.getState().forcedPortRates["m1-out-0"]).toBeUndefined();
  expect(history.redo()).toBe(true);
  expect(W.getState().blueprintLibrary[bp].revision).toBe(revision + 1);
  enter(copy);
  expect(W.getState().blueprintLibrary[bp].revision).toBe(revision + 1);
  expect(D.getState().forcedPortRates["m1-out-0"]).toBeUndefined();
});

it("retains blueprint definitions and instance versions through a world JSON round trip", () => {
  const id = makeBlueprint();
  const bp = W.getState().canvasMap[id].blueprintId!;
  const revision = W.getState().blueprintLibrary[bp].revision;
  const saved = W.getState().toWorldDocument();
  const loaded = parseFactoryDocumentJson(JSON.stringify(saved));
  W.getState().replaceWorldDocument(loaded);
  enter(id);
  expect(W.getState().blueprintLibrary[bp].revision).toBe(revision);
  enter("world");
  expect(
    D.getState().nodes.find((n) => n.id === `${id}-out-0`)?.data.perMinute,
  ).toBeCloseTo(30);
});

it("duplicates and imports factories with connected nested ports and routed wires", () => {
  const outer = W.getState().addFactory({ x: 0, y: 0 })!;
  enter(outer);
  const nested = W.getState().addFactory({ x: 256, y: 256 })!;
  enter(nested);
  D.getState().addMachine("Recipe_IngotIron_C", { x: 256, y: 256 });
  D.getState().onConnect({
    source: "m1-out-0",
    target: "boundary-out-0-in-0",
    sourceHandle: "item",
    targetHandle: "item",
  });
  enter(outer);
  D.getState().onConnect({
    source: `${nested}-out-0`,
    target: "boundary-out-0-in-0",
    sourceHandle: "item",
    targetHandle: "item",
  });
  enter("world");
  const duplicate = W.getState().duplicateFactory(outer)!;
  const duplicated = W.getState().canvasMap[duplicate];
  expect(duplicated.edges).toHaveLength(1);
  expect(
    duplicated.nodes.some((n) => n.id === duplicated.edges[0].source),
  ).toBe(true);
  expect(
    duplicated.routeGraph?.nets.some((n) =>
      n.edgeIds.includes(duplicated.edges[0].id),
    ),
  ).toBe(true);
  const exported = buildCanvasSubtreeExport(W.getState().canvasMap, outer);
  const imported = mergeImportedSubtree(
    W.getState().canvasMap,
    "world",
    exported,
    { x: 900, y: 0 },
  );
  const computed = computeFactoryHierarchy(imported.canvases);
  expect(
    computed.results.world.effectiveRate[`${imported.newRootId}-out-0`],
  ).toBeCloseTo(30);
});

it("blocks nested factories and blueprint instances, and imports definitions into the library", () => {
  const id = makeBlueprint();
  const bp = W.getState().canvasMap[id].blueprintId!;
  const imported = parseBlueprint(
    JSON.stringify(exportBlueprint(W.getState().blueprintLibrary[bp])),
  );
  W.getState().importBlueprint(imported);
  expect(W.getState().blueprintLibrary[imported.id]).toBeDefined();
  enter(id);
  expect(W.getState().addFactory({ x: 0, y: 0 })).toBeNull();
  expect(W.getState().addBlueprint(bp, { x: 0, y: 0 })).toBeNull();
  expect(W.getState().createBlueprint({ x: 0, y: 0 }, "Nested")).toBeNull();
});

it("releases boundary items after deleting connections so another item can use the terminal", () => {
  const id = makeBlueprint();
  enter(id);
  const edge = D.getState().edges.find(
    (e) => e.target === "boundary-out-0-in-0",
  )!;
  D.getState().onEdgesChange([{ type: "remove", id: edge.id }]);
  expect(
    D.getState().nodes.find((n) => n.id === "boundary-out-0-in-0")?.data.itemId,
  ).toBe("");
  expect(
    D.getState().nodes.filter((n) => n.type === "boundaryFrame"),
  ).toHaveLength(4);
});
