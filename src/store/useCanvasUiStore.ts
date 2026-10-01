import { create } from "zustand";

interface CanvasUiState {
  /** When true, machines snap to the visible grid on both axes. */
  machineGridSnap: boolean;
  toggleMachineGridSnap: () => void;
  selectionMode: "full" | "partial";
  toggleSelectionMode: () => void;
}

export const useCanvasUiStore = create<CanvasUiState>((set) => ({
  machineGridSnap: true,
  selectionMode: "full",
  toggleMachineGridSnap: () =>
    set((s) => ({ machineGridSnap: !s.machineGridSnap })),
  toggleSelectionMode: () =>
    set((s) => ({ selectionMode: s.selectionMode === "full" ? "partial" : "full" })),
}));
