import { FACTORY_LAYOUT } from "@/constants/factoryLayout";
import type { Node } from "@xyflow/react";
import type { CanvasRecord } from "@/types/canvas";
import type { BlueprintLibrary } from "@/types/blueprint";
import type {
  BoundaryPortDef,
  FactoryFrameData,
  ItemPortData,
  MachineFrameData,
} from "@/types/graph";
import { MACHINE_LAYOUT as L } from "@/constants/machineLayout";
import { alignFrameHeight, computeVerticalSlotYs } from "./machinePortLayout";
import { computeFlowSolveSnapshot } from "./flowSolveSnapshot";
import { findRecipeByKey } from "./recipeLookup";
import { computeEnergyLedger, type EnergyLedger } from "./energyLedger";
import {
  followPortVertices,
  portHandlesFromNodes,
  pruneRouteGraph,
  buildRouteGraph,
  topologyEdgesFromFlow,
} from "./routing";
import type { FlowSolveResult } from "@/types/flowSolve";

export type FactoryTotals = EnergyLedger & {
  shards: number;
  shardLoads: { clock: number; count: number }[];
  machines: number;
  machinesByType: Record<string, number>;
  nestedFactoryCount: number;
};
export function powerShards(clock: number, count: number): number {
  return (
    Math.max(0, Math.ceil(Math.max(0, clock - 100) / 50 - 1e-9)) *
    Math.max(0, Math.ceil(Math.max(0, count) - 1e-9))
  );
}
export function scaledPowerShards(
  loads: FactoryTotals["shardLoads"],
  scale = 1,
): number {
  return loads.reduce(
    (sum, load) => sum + powerShards(load.clock, load.count * scale),
    0,
  );
}
export function computeFactoryHierarchy(
  canvases: Record<string, CanvasRecord>,
  library: BlueprintLibrary = {},
) {
  const map = { ...canvases };
  const results: Record<string, FlowSolveResult> = {};
  const totals: Record<string, FactoryTotals> = {};
  const visiting = new Set<string>();
  function visit(id: string): void {
    if (results[id] || !map[id]) return;
    if (visiting.has(id)) throw new Error("Cyclic factory nesting");
    visiting.add(id);
    let canvas = map[id];
    let nodes = canvas.nodes;
    for (const frame of canvas.nodes.filter((n) => n.type === "factoryFrame")) {
      const child = map[frame.id];
      if (!child) continue;
      visit(child.id);
      const boundary: {
        inputs: BoundaryPortDef[];
        outputs: BoundaryPortDef[];
      } = { inputs: [], outputs: [] };
      for (const terminal of child.nodes.filter(
        (n) => n.type === "boundaryFrame",
      )) {
        const port = child.nodes.find(
          (n) => n.parentId === terminal.id && n.type === "itemPort",
        );
        if (!port) continue;
        const kind = terminal.data.boundaryKind === "in" ? "in" : "out";
        const pd = port.data as ItemPortData;
        boundary[kind === "in" ? "inputs" : "outputs"].push({
          id: `${frame.id}-${kind}-${terminal.data.boundaryIndex}`,
          itemId: pd.itemId,
          displayName: pd.displayName,
          linkedPortId: port.id,
          perMinute: results[child.id].effectiveRate[port.id] ?? 0,
        });
      }
      const hasPorts = boundary.inputs.length + boundary.outputs.length > 0;
      const count = Math.max(
        boundary.inputs.length,
        boundary.outputs.length,
        1,
      );
      const height = hasPorts
        ? alignFrameHeight(L.FRAME_MIN_H, count)
        : FACTORY_LAYOUT.HEIGHT;
      const data: FactoryFrameData = {
        ...(frame.data as FactoryFrameData),
        boundary: { version: 1, ...boundary },
        blueprintId: child.blueprintId,
        blueprintRevision: child.blueprintRevision,
        blueprintOutdated: Boolean(
          child.blueprintId &&
          library[child.blueprintId] &&
          child.blueprintRevision !== library[child.blueprintId].revision,
        ),
        totalPowerMw: totals[child.id].consumerTotalMw,
        totalShards: totals[child.id].shards,
      };
      const updated = {
        ...frame,
        data,
        style: {
          ...frame.style,
          width: hasPorts ? L.PORT_W * 2 + L.BODY_W : FACTORY_LAYOUT.WIDTH,
          height,
        },
      };
      const ports: Node[] = [];
      for (const kind of ["in", "out"] as const) {
        const entries = boundary[kind === "in" ? "inputs" : "outputs"];
        const ys = computeVerticalSlotYs(entries.length, height);
        entries.forEach((p, index) =>
          ports.push({
            id: p.id,
            type: "itemPort",
            parentId: frame.id,
            position: {
              x: kind === "in" ? 0 : L.PORT_W + L.BODY_W,
              y: ys[index],
            },
            draggable: false,
            selectable: false,
            data: {
              kind,
              itemId: p.itemId,
              displayName: p.displayName,
              perMinute: p.perMinute ?? 0,
              portIndex: index,
              amountPerCraft: 1,
              slotsOnSide: entries.length,
            },
          }),
        );
      }
      nodes = [
        ...nodes.filter((n) => n.id !== frame.id && n.parentId !== frame.id),
        updated,
        ...ports,
      ];
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = canvas.edges.filter(
      (e) =>
        byId.has(e.source) &&
        byId.has(e.target) &&
        byId.get(e.source)!.data.itemId === byId.get(e.target)!.data.itemId,
    );
    const portIds = new Set(
      nodes.filter((n) => n.type === "itemPort").map((n) => n.id),
    );
    const forcedPortRates = Object.fromEntries(
      Object.entries(canvas.forcedPortRates).filter(([pid]) =>
        portIds.has(pid),
      ),
    );
    canvas = { ...canvas, nodes, edges, forcedPortRates };
    results[id] = computeFlowSolveSnapshot(nodes, edges, forcedPortRates);
    const result = results[id];
    const ledger = computeEnergyLedger(nodes, edges, forcedPortRates, result);
    const total: FactoryTotals = {
      ...ledger,
      shards: 0,
      shardLoads: [],
      machines: 0,
      machinesByType: {},
      nestedFactoryCount: 0,
    };
    for (const n of nodes) {
      if (n.type === "machineFrame") {
        const count = result.machineMultiplier[n.id] ?? 1;
        total.machines += count;
        const recipeKey = (n.data as MachineFrameData).recipeKey;
        const machineType = findRecipeByKey(recipeKey)?.producedIn?.[0] ?? "Unknown";
        total.machinesByType[machineType] =
          (total.machinesByType[machineType] ?? 0) + count;
        total.shardLoads.push({
          clock: result.machineClockPercent[n.id] ?? 100,
          count,
        });
      } else if (n.type === "factoryFrame" && totals[n.id]) {
        const scale = n.data.blueprintId
          ? (result.machineMultiplier[n.id] ?? 1)
          : 1;
        const child = totals[n.id];
        for (const key of [
          "consumerTotalMw",
          "consumerBaseline100Mw",
          "overclockExtraMw",
          "underclockSavedMw",
          "generatorCount",
          "generatorCapacityMw",
          "machines",
        ] as const)
          total[key] += child[key] * scale;
        total.shardLoads.push(
          ...child.shardLoads.map((load) => ({
            ...load,
            count: load.count * scale,
          })),
        );
        for (const [machineType, count] of Object.entries(child.machinesByType)) {
          total.machinesByType[machineType] =
            (total.machinesByType[machineType] ?? 0) + count * scale;
        }
        total.nestedFactoryCount += child.nestedFactoryCount + 1;
      }
    }
    total.shards = scaledPowerShards(total.shardLoads);
    totals[id] = total;
    map[id] = canvas;
    visiting.delete(id);
  }
  for (const id of Object.keys(map)) visit(id);
  return { canvases: map, results, totals };
}

/** Apply geometry only when switching/saving canvases, not while dragging wires. */
export function reconcileFactoryHierarchy(
  canvases: Record<string, CanvasRecord>,
  library: BlueprintLibrary = {},
) {
  const computed = computeFactoryHierarchy(canvases, library).canvases;
  return Object.fromEntries(
    Object.entries(computed).map(([id, canvas]) => [
      id,
      {
        ...canvas,
        routeGraph: followPortVertices(
          pruneRouteGraph(
            canvas.routeGraph ??
              buildRouteGraph(
                portHandlesFromNodes(canvas.nodes),
                topologyEdgesFromFlow(canvas.edges),
              ),
            new Set(
              canvas.nodes
                .filter((n) => n.type === "itemPort")
                .map((n) => n.id),
            ),
            new Set(canvas.edges.map((e) => e.id)),
          ),
          portHandlesFromNodes(canvas.nodes),
        ),
      },
    ]),
  );
}
