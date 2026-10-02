import type { Edge, Node } from "@xyflow/react";
import type { CanvasRecord } from "@/types/canvas";
import { MACHINE_LAYOUT as L } from "@/constants/machineLayout";
import { MACHINE_SNAP_GRID, snapToGrid } from "@/constants/flowGrid";
import { followPortVertices, portHandlesFromNodes, pruneRouteGraph } from "@/lib/routing";

export const BOUNDARY_FRAME_WIDTH = L.PORT_W + 16;
export const BOUNDARY_FRAME_HEIGHT = L.PORT_ROW + 32;

type ScreenRect = { left: number; top: number; right: number; bottom: number };

export function findFreeBoundaryScreenPosition(
  kind: "in" | "out",
  button: ScreenRect,
  canvas: ScreenRect,
  occupied: ScreenRect[],
  zoom: number,
  snapScreenY: (y: number) => number = (y) => y,
): { x: number; y: number } {
  const gap = 16;
  const width = BOUNDARY_FRAME_WIDTH * zoom;
  const height = BOUNDARY_FRAME_HEIGHT * zoom;
  const startY = button.bottom + gap;
  const rows = Math.max(
    1,
    Math.floor((canvas.bottom - startY - height) / (height + gap)) + 1,
  );
  for (let column = 0; ; column++) {
    const x = kind === "in"
      ? button.left + column * (width + gap)
      : button.right - width - column * (width + gap);
    for (let row = 0; row < rows; row++) {
      const y = snapScreenY(startY + row * (height + gap));
      const clear = occupied.every((rect) =>
        x >= rect.right + 8 || x + width + 8 <= rect.left ||
        y >= rect.bottom + 8 || y + height + 8 <= rect.top,
      );
      if (clear) return { x, y };
    }
  }
}

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
      position: { x: position.x, y: snapToGrid(position.y, MACHINE_SNAP_GRID) },
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
      position: { x: 8, y: 32 },
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
  const retained = resetDisconnectedBoundaries(
    canvas.nodes.filter((n) => !legacyUnused.has(n.id) && !legacyUnused.has(n.parentId ?? "")),
    canvas.edges,
  );
  const boundaryIds = new Set(retained.filter((n) => n.type === "boundaryFrame").map((n) => n.id));
  let aligned = false;
  const nodes = retained.map((n) => {
    if (n.type === "boundaryFrame") {
      const y = snapToGrid(n.position.y, MACHINE_SNAP_GRID);
      if (n.position.y === y && n.style?.height === BOUNDARY_FRAME_HEIGHT) return n;
      aligned = true;
      return { ...n, position: { ...n.position, y }, style: { ...n.style, height: BOUNDARY_FRAME_HEIGHT } };
    }
    if (n.type !== "itemPort" || !boundaryIds.has(n.parentId ?? "") || n.position.y === 32) return n;
    aligned = true;
    return { ...n, position: { ...n.position, y: 32 } };
  });
  if (!aligned && retained === canvas.nodes) return canvas;
  const validPorts = new Set(nodes.filter((n) => n.type === "itemPort").map((n) => n.id));
  return {
    ...canvas,
    nodes,
    routeGraph: canvas.routeGraph
      ? followPortVertices(pruneRouteGraph(canvas.routeGraph, validPorts, new Set(canvas.edges.map((e) => e.id))), portHandlesFromNodes(nodes))
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
