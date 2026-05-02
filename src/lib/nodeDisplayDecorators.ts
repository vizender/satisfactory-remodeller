import type { Node } from "@xyflow/react";
import type { ItemPortData } from "@/types/graph";

export type ConnectionDragPreview = {
  sourcePortId: string;
  itemId: string;
  /** Connexion depuis une sortie (handle source) ou une entrée (handle target). */
  fromOutput: boolean;
};

export type ReorderDragSession = {
  machineFrameId: string;
  side: "in" | "out";
};

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function isCompatibleConnectionTarget(
  preview: ConnectionDragPreview,
  portId: string,
  d: ItemPortData,
): boolean {
  if (portId === preview.sourcePortId) return false;
  if (preview.fromOutput) {
    return d.kind === "in" && d.itemId === preview.itemId;
  }
  return d.kind === "out" && d.itemId === preview.itemId;
}

export function machineHasCompatiblePortForPreview(
  nodes: Node[],
  machineFrameId: string,
  preview: ConnectionDragPreview,
): boolean {
  for (const n of nodes) {
    if (n.type !== "itemPort" || n.parentId !== machineFrameId) continue;
    const d = n.data as ItemPortData;
    if (isCompatibleConnectionTarget(preview, n.id, d)) return true;
  }
  return false;
}

/** Classes pour surbrillance / atténuation pendant une connexion en cours. */
export function applyConnectionPreviewToNodes(
  nodes: Node[],
  preview: ConnectionDragPreview | null,
): Node[] {
  if (!preview) return nodes;
  return nodes.map((n) => {
    if (n.type === "machineFrame") {
      const dim = !machineHasCompatiblePortForPreview(nodes, n.id, preview);
      return {
        ...n,
        className: cn(n.className, dim ? "rf-machine-dim" : undefined),
      };
    }
    if (n.type === "itemPort") {
      const d = n.data as ItemPortData;
      if (n.id === preview.sourcePortId) {
        return {
          ...n,
          className: cn(n.className, "rf-port-connection-origin"),
        };
      }
      if (isCompatibleConnectionTarget(preview, n.id, d)) {
        return {
          ...n,
          className: cn(n.className, "rf-port-connection-valid"),
        };
      }
      return {
        ...n,
        className: cn(n.className, "rf-port-connection-invalid"),
      };
    }
    return n;
  });
}

/** Transition fluide sur les positions pendant un réordonnancement de ports. */
export function applyReorderTransitionToNodes(
  nodes: Node[],
  session: ReorderDragSession | null,
): Node[] {
  if (!session) return nodes;
  return nodes.map((n) => {
    if (n.type !== "itemPort") return n;
    const d = n.data as ItemPortData;
    if (
      n.parentId !== session.machineFrameId ||
      d.kind !== session.side
    ) {
      return n;
    }
    return {
      ...n,
      className: cn(n.className, "rf-reorder-slot-transition"),
    };
  });
}
