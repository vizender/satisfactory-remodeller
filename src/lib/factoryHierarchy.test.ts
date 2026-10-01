import { expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { CanvasRecord } from "@/types/canvas";
import { computeFactoryHierarchy, powerShards } from "./factoryHierarchy";
import { buildBoundaryNodes, ensureBoundaryNodes } from "./factoryBoundaries";
import {
  blueprintFingerprint,
  exportBlueprint,
  parseBlueprint,
  publishBlueprint,
} from "./blueprints";
import {
  captureCanvasSelection,
  pasteCanvasSelection,
} from "./canvasClipboard";

const node = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  parentId?: string,
): Node => ({ id, type, data, parentId, position: { x: 0, y: 0 } });
function fixture(blueprint = false) {
  let child: CanvasRecord = ensureBoundaryNodes({
    id: "f1",
    name: "Iron",
    parent: { canvasId: "world", factoryNodeId: "f1" },
    nodes: [],
    edges: [],
    forcedPortRates: {},
    ...(blueprint
      ? { kind: "blueprint", blueprintId: "bp", blueprintRevision: 1 }
      : {}),
  });
  child.nodes.push(
    ...buildBoundaryNodes("in", 0, { x: 32, y: 64 }),
    ...buildBoundaryNodes("out", 0, { x: 704, y: 64 }),
  );
  child.nodes = child.nodes.map((n) =>
    n.type === "itemPort"
      ? { ...n, data: { ...n.data, itemId: "iron", perMinute: 1 } }
      : n,
  );
  child.nodes.push(
    node("m1", "machineFrame", {
      clockPercent: 150,
      recipeKey: "Recipe_IngotIron_C",
    }),
    node(
      "m1-in",
      "itemPort",
      { kind: "in", itemId: "iron", perMinute: 30 },
      "m1",
    ),
    node(
      "m1-out",
      "itemPort",
      { kind: "out", itemId: "iron", perMinute: 30 },
      "m1",
    ),
  );
  child.edges = [
    {
      id: "e1",
      source: "boundary-in-0-out-0",
      target: "m1-in",
      data: { itemId: "iron" },
    },
    {
      id: "e2",
      source: "m1-out",
      target: "boundary-out-0-in-0",
      data: { itemId: "iron" },
    },
  ];
  const world: CanvasRecord = {
    id: "world",
    name: "World",
    nodes: [node("f1", "factoryFrame", { label: "Iron" })],
    edges: [],
    forcedPortRates: {},
  };
  return { world, f1: child };
}

it("exposes connected factory inputs and outputs and keeps factory rates driven from inside", () => {
  const map = fixture();
  map.f1.forcedPortRates["m1-out"] = 90;
  map.world.forcedPortRates["f1-out-0"] = 150;
  const result = computeFactoryHierarchy(map);
  expect(result.results.world.effectiveRate["f1-in-0"]).toBeCloseTo(90);
  expect(result.results.world.effectiveRate["f1-out-0"]).toBeCloseTo(90);
  expect(result.results.world.machineMultiplier.f1).toBeCloseTo(1);
  expect(result.totals.world.machines).toBeCloseTo(2);
  expect(result.totals.world.shards).toBe(2);
  expect(result.totals.world.consumerTotalMw).toBeGreaterThan(8);
  expect(
    result.canvases.world.nodes.find((n) => n.id === "f1")?.style?.width,
  ).toBe(544);
});

it("scales fractional blueprint copies from outside without changing internal machines or clocks", () => {
  const map = fixture(true);
  map.world.forcedPortRates["f1-out-0"] = 112.5;
  const result = computeFactoryHierarchy(map);
  expect(result.results.world.machineMultiplier.f1).toBeCloseTo(2.5);
  expect(result.results.world.effectiveRate["f1-in-0"]).toBeCloseTo(112.5);
  expect(result.results.f1.machineMultiplier.m1).toBeCloseTo(1);
  expect(result.results.f1.machineClockPercent.m1).toBe(150);
  expect(result.totals.world.consumerTotalMw).toBeCloseTo(
    result.totals.f1.consumerTotalMw * 2.5,
  );
  map.world.nodes[0].data.blueprintCount = 0.5;
  expect(
    computeFactoryHierarchy(map).results.world.machineMultiplier.f1,
  ).toBeCloseTo(0.5);
});

it("counts every nested canvas independently even when machine ids are reused", () => {
  const map = fixture();
  const nested = fixture().f1;
  nested.id = "f2";
  nested.parent = { canvasId: "f1", factoryNodeId: "f2" };
  map.f1.nodes.push(node("f2", "factoryFrame", {}));
  const result = computeFactoryHierarchy({ ...map, f2: nested });
  expect(result.totals.world.machines).toBeCloseTo(2);
  expect(result.totals.world.shards).toBe(2);
  expect(result.totals.world.nestedFactoryCount).toBe(2);
});

it.each([
  [100, 0],
  [130, 1],
  [150, 1],
  [180, 2],
  [200, 2],
  [250, 3],
])("counts shards at %s percent", (clock, shards) => {
  expect(powerShards(clock, 2)).toBe(shards * 2);
});

it("keeps explicitly created factory ports but clears their items after disconnection", () => {
  const map = fixture();
  map.f1.edges = [];
  const child = ensureBoundaryNodes(map.f1);
  expect(
    child.nodes
      .filter(
        (n) => n.type === "itemPort" && n.parentId?.startsWith("boundary"),
      )
      .every((n) => !n.data.itemId),
  ).toBe(true);
  const result = computeFactoryHierarchy({ ...map, f1: child });
  expect(result.canvases.world.nodes.filter((n) => n.type === "itemPort")).toHaveLength(2);
  expect(result.canvases.world.nodes.filter((n) => n.type === "itemPort").every((n) => !n.data.itemId)).toBe(true);
});

it("publishes edited variants while untouched older copies remain independent and outdated", () => {
  const initial = publishBlueprint(fixture(true).f1, {});
  const older = structuredClone(initial.canvas);
  const changed = { ...initial.canvas, forcedPortRates: { "m1-out": 90 } };
  const next = publishBlueprint(changed, initial.library);
  expect(next.library.bp.revision).toBe(2);
  expect(publishBlueprint(older, next.library).library).toBe(next.library);
  const map = fixture(true);
  const result = computeFactoryHierarchy({ ...map, f1: older }, next.library);
  expect(
    result.canvases.world.nodes.find((n) => n.id === "f1")?.data
      .blueprintOutdated,
  ).toBe(true);
  expect(result.results.f1.effectiveRate["m1-out"]).toBeCloseTo(45);
  const measured = {
    ...older,
    nodes: older.nodes.map((n) => ({
      ...n,
      selected: true,
      width: 544,
      height: 320,
      measured: { width: 544, height: 320 },
    })),
  };
  expect(blueprintFingerprint(measured)).toBe(blueprintFingerprint(older));
});

it("round-trips blueprint JSON and rejects nested factories", () => {
  const published = publishBlueprint(fixture(true).f1, {});
  const exported = exportBlueprint(published.library.bp);
  const imported = parseBlueprint(JSON.stringify(exported));
  expect(imported.id).not.toBe("bp");
  expect(imported.canvas.nodes.some((n) => n.id === "m1")).toBe(true);
  exported.canvas.nodes.push(node("f2", "factoryFrame", {}));
  expect(() => parseBlueprint(JSON.stringify(exported))).toThrow(
    /cannot contain/,
  );
  expect(() => parseBlueprint("{}")).toThrow();
});

it("prevents pasting nested factories into blueprints", () => {
  const map = fixture(true);
  map.world.nodes[0].selected = true;
  const clipboard = captureCanvasSelection(map, "world")!;
  expect(pasteCanvasSelection(map, "f1", clipboard)).toBe(map);
});

it("cascades fixed internal factory demand backward and forward through the parent chain", () => {
  const map = fixture();
  map.f1.forcedPortRates["m1-out"] = 90;
  map.world.nodes.unshift(
    node("up", "machineFrame", { clockPercent: 100 }),
    node(
      "up-out",
      "itemPort",
      { kind: "out", itemId: "iron", perMinute: 30 },
      "up",
    ),
  );
  map.world.nodes.push(
    node("down", "machineFrame", { clockPercent: 100 }),
    node(
      "down-in",
      "itemPort",
      { kind: "in", itemId: "iron", perMinute: 30 },
      "down",
    ),
  );
  map.world.edges = [
    { id: "supply", source: "up-out", target: "f1-in-0" },
    { id: "product", source: "f1-out-0", target: "down-in" },
  ];
  for (const forced of [{}, { "up-out": 30 }]) {
    map.world.forcedPortRates = forced;
    const result = computeFactoryHierarchy(map).results.world;
    expect(result.machineMultiplier.up).toBeCloseTo(3);
    expect(result.machineMultiplier.down).toBeCloseTo(3);
    expect(result.hardConflict).toBe(false);
  }
});

it("rounds physical shard requirements after scaling fractional blueprint machines", () => {
  const map = fixture(true);
  map.f1.forcedPortRates["m1-out"] = 30;
  map.world.forcedPortRates["f1-out-0"] = 112.5;
  const result = computeFactoryHierarchy(map);
  expect(result.totals.world.machines).toBeCloseTo(2.5);
  expect(result.totals.world.shards).toBe(3);
});
