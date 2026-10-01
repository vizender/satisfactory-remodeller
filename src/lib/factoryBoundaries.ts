import type { Edge, Node } from "@xyflow/react";
import type { CanvasRecord } from "@/types/canvas";
import { MACHINE_LAYOUT as L } from "@/constants/machineLayout";
import { pruneRouteGraph } from "@/lib/routing";

export const BOUNDARY_FRAME_WIDTH = L.PORT_W + 16;
export const BOUNDARY_FRAME_HEIGHT = L.PORT_ROW + 28;

export function buildBoundaryNodes(
  kind: "in" | "out",
  index: number,
  position: { x: number; y: number },
): Node[] {
  const id = `boundary-${kind}-${index}`;
  const portKind = kind === "in" ? "out" : "in";
  return [
    {
      id,
      type: "boundaryFrame",
      position,
      style: { width: BOUNDARY_FRAME_WIDTH, height: BOUNDARY_FRAME_HEIGHT },
      data: {
        boundaryKind: kind,
        boundaryIndex: index,
        explicit: true,
        label: kind === "in" ? "Input" : "Output",
      },
      draggable: true,
      selectable: true,
    },
    {
      id: `${id}-${portKind}-0`,
      parentId: id,
      type: "itemPort",
      position: { x: 8, y: 28 },
      draggable: false,
      selectable: false,
      data: {
        kind: portKind,
        portIndex: 0,
        itemId: "",
        displayName: "—",
        perMinute: 0,
        amountPerCraft: 1,
        slotsOnSide: 1,
      },
    },
  ];
}

/** Preserve explicit ports; remove unused terminals created by older auto-fill behavior. */
export function ensureBoundaryNodes(canvas: CanvasRecord): CanvasRecord {
  if (!canvas.parent) return canvas;
  const legacyUnused = new Set(canvas.nodes.filter((n) => {
    if (n.type !== "boundaryFrame" || n.data.explicit === true) return false;
    const ports = canvas.nodes.filter((p) => p.parentId === n.id);
    return ports.every((p) =>
      !canvas.edges.some((e) => e.source === p.id || e.target === p.id) &&
      canvas.forcedPortRates[p.id] === undefined,
    );
  }).map((n) => n.id));
  const nodes = resetDisconnectedBoundaries(
    canvas.nodes.filter((n) => !legacyUnused.has(n.id) && !legacyUnused.has(n.parentId ?? "")),
    canvas.edges,
  );
  if (nodes === canvas.nodes) return canvas;
  const validPorts = new Set(nodes.filter((n) => n.type === "itemPort").map((n) => n.id));
  return {
    ...canvas,
    nodes,
    routeGraph: canvas.routeGraph
      ? pruneRouteGraph(canvas.routeGraph, validPorts, new Set(canvas.edges.map((e) => e.id)))
      : undefined,
  };
}

export function resetDisconnectedBoundaries(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const boundaryIds = new Set(
    nodes.filter((n) => n.type === "boundaryFrame").map((n) => n.id),
  );
  let changed = false;
  const next = nodes.map((n) => {
    if (
      n.type !== "itemPort" ||
      !boundaryIds.has(n.parentId ?? "") ||
      !n.data.itemId ||
      edges.some((e) => e.source === n.id || e.target === n.id)
    )
      return n;
    changed = true;
    return {
      ...n,
      data: { ...n.data, itemId: "", displayName: "—", perMinute: 0 },
    };
  });
  return changed ? next : nodes;
}
