import type { Node } from "@xyflow/react";
import {
  formatItemClassId,
  isPortItemAssigned,
  type ItemPortData,
} from "@/types/graph";

function assignSlotOnContainer(
  nodes: Node[],
  containerId: string,
  slotIndex: number,
  itemId: string,
): Node[] {
  return nodes.map((n) => {
    if (n.parentId !== containerId || n.type !== "itemPort") return n;
    const d = n.data as ItemPortData;
    if (d.portIndex !== slotIndex) return n;
    if (isPortItemAssigned(d.itemId)) return n;
    return {
      ...n,
      data: {
        ...d,
        itemId,
        displayName: formatItemClassId(itemId),
        perMinute: 1,
      } satisfies ItemPortData,
    };
  });
}

/** Après une connexion : assigne l’item aux ports du même slot encore vides. */
export function applyContainerItemAssignment(
  nodes: Node[],
  sourcePortId: string,
  targetPortId: string,
  itemId: string,
): Node[] {
  if (!itemId) return nodes;

  let next = nodes;
  for (const portId of [sourcePortId, targetPortId]) {
    const port = next.find((n) => n.id === portId && n.type === "itemPort");
    if (!port?.parentId) continue;
    const parent = next.find((n) => n.id === port.parentId);
    if (parent?.type !== "containerFrame") continue;
    const slot = (port.data as ItemPortData).portIndex;
    next = assignSlotOnContainer(next, port.parentId, slot, itemId);
  }
  return next;
}
