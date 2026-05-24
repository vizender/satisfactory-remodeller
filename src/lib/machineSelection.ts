import type { NodeChange } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { useDocumentStore } from "@/store/useDocumentStore";

/** Scale appliqué au corps central quand la machine est sélectionnée. */
export const MACHINE_BODY_SELECT_SCALE = 1.035;

export type MachineSelectMode = "replace" | "add" | "toggle";

export function machineBodyHalfGrowPx(
  scale = MACHINE_BODY_SELECT_SCALE,
): number {
  return (MACHINE_LAYOUT.BODY_W * (scale - 1)) / 2;
}

/** Décalage horizontal des ports pour rester collés au corps agrandi. */
export function machinePortShiftXPx(
  kind: "in" | "out",
  selected: boolean,
  scale = MACHINE_BODY_SELECT_SCALE,
): number {
  if (!selected) return 0;
  const half = machineBodyHalfGrowPx(scale);
  return kind === "in" ? -half : half;
}

const SELECTABLE_FRAME_TYPES = new Set(["machineFrame", "factoryFrame"]);

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
