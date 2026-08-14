import type { NodeChange } from "@xyflow/react";
import { useDocumentStore } from "@/store/useDocumentStore";

export type MachineSelectMode = "replace" | "add" | "toggle";

const SELECTABLE_FRAME_TYPES = new Set([
  "machineFrame",
  "factoryFrame",
  "containerFrame",
]);

export function applyMachineSelection(
  frameId: string,
  mode: MachineSelectMode,
): void {
  const { nodes, onNodesChange } = useDocumentStore.getState();
  const target = nodes.find(
    (n) => n.id === frameId && SELECTABLE_FRAME_TYPES.has(n.type ?? ""),
  );
  const wasSelected = target?.selected ?? false;

  const changes: NodeChange[] = nodes.map((n) => {
    if (!SELECTABLE_FRAME_TYPES.has(n.type ?? "")) {
      return { type: "select", id: n.id, selected: false };
    }
    if (n.id === frameId) {
      if (mode === "toggle") {
        return { type: "select", id: n.id, selected: !wasSelected };
      }
      return { type: "select", id: n.id, selected: true };
    }
    if (mode === "replace") {
      return { type: "select", id: n.id, selected: false };
    }
    return { type: "select", id: n.id, selected: n.selected ?? false };
  });
  onNodesChange(changes);
}

export function clearMachineSelection(): void {
  const { nodes, edges, onNodesChange, onEdgesChange } =
    useDocumentStore.getState();
  const hadNodeSelection = nodes.some((n) => n.selected);
  const hadEdgeSelection = edges.some((e) => e.selected);
  if (!hadNodeSelection && !hadEdgeSelection) return;

  if (hadNodeSelection) {
    onNodesChange(
      nodes.map((n) => ({ type: "select" as const, id: n.id, selected: false })),
    );
  }
  if (hadEdgeSelection) {
    onEdgesChange(
      edges.map((e) => ({ type: "select" as const, id: e.id, selected: false })),
    );
  }
}
