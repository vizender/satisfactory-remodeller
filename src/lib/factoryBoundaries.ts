import type { Edge, Node } from "@xyflow/react";
import type { CanvasRecord } from "@/types/canvas";
import { MACHINE_LAYOUT as L } from "@/constants/machineLayout";

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
      style: { width: L.PORT_W, height: L.PORT_ROW },
      data: {
        boundaryKind: kind,
        boundaryIndex: index,
        label: kind === "in" ? "Input" : "Output",
      },
      draggable: true,
      selectable: true,
    },
    {
      id: `${id}-${portKind}-0`,
      parentId: id,
      type: "itemPort",
      position: { x: 0, y: 0 },
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

/** Always leave a free connector at each side for adding another exposed item. */
export function ensureBoundaryNodes(canvas: CanvasRecord): CanvasRecord {
  if (!canvas.parent) return canvas;
  let nodes = resetDisconnectedBoundaries(canvas.nodes, canvas.edges);
  for (const kind of ["in", "out"] as const) {
    const frames = nodes.filter(
      (n) => n.type === "boundaryFrame" && n.data.boundaryKind === kind,
    );
    const available = frames.some((n) =>
      nodes.some(
        (p) =>
          p.parentId === n.id &&
          !canvas.edges.some((e) => e.source === p.id || e.target === p.id),
      ),
    );
    if (available) continue;
    const index =
      Math.max(-1, ...frames.map((n) => Number(n.data.boundaryIndex) || 0)) + 1;
    nodes = [
      ...nodes,
      ...buildBoundaryNodes(kind, index, {
        x: kind === "in" ? 32 : 704,
        y: 64 + index * 96,
      }),
    ];
  }
  return nodes === canvas.nodes ? canvas : { ...canvas, nodes };
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
