import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import type { Node } from "@xyflow/react";
import type { ItemPortData } from "@/types/graph";
import { isItemEdgeData } from "@/types/edgeData";
import type { PortHandle, TopologyEdge } from "./types";
import type { Edge } from "@xyflow/react";

const { PORT_W, PORT_ROW, HANDLE_SIZE } = MACHINE_LAYOUT;

function absPosition(
  nodesById: Map<string, Node>,
  id: string,
  seen: Set<string> = new Set(),
): { x: number; y: number } | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const n = nodesById.get(id);
  if (!n) return null;
  if (n.parentId) {
    const p = absPosition(nodesById, n.parentId, seen);
    if (!p) return { x: n.position.x, y: n.position.y };
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  }
  return { x: n.position.x, y: n.position.y };
}

/** Handle position in absolute canvas space (left for in, right for out). */
export function portHandlesFromNodes(nodes: Node[]): PortHandle[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: PortHandle[] = [];
  for (const n of nodes) {
    if (n.type !== "itemPort") continue;
    const d = n.data as ItemPortData;
    const abs = absPosition(byId, n.id);
    if (!abs) continue;
    const y = abs.y + PORT_ROW / 2;
    const r = HANDLE_SIZE / 2;
    const x = d.kind === "in" ? abs.x - r : abs.x + PORT_W + r;
    out.push({
      portId: n.id,
      x,
      y,
      kind: d.kind,
      itemId: d.itemId,
      parentId: n.parentId,
    });
  }
  return out;
}

export function topologyEdgesFromFlow(edges: Edge[]): TopologyEdge[] {
  const out: TopologyEdge[] = [];
  for (const e of edges) {
    const data = e.data;
    const itemId = isItemEdgeData(data) ? data.itemId : "";
    const suggested = isItemEdgeData(data) ? Boolean(data.suggested) : false;
    if (suggested) continue;
    if (!e.source || !e.target || !itemId) continue;
    out.push({
      id: e.id,
      source: e.source,
      target: e.target,
      itemId,
    });
  }
  return out;
}

export function portHandleMap(ports: PortHandle[]): Map<string, PortHandle> {
  return new Map(ports.map((p) => [p.portId, p]));
}
