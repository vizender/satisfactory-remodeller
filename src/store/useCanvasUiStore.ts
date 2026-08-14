import { create } from "zustand";

interface CanvasUiState {
  /** When true, machines snap to the visible grid on both axes. */
  machineGridSnap: boolean;
  toggleMachineGridSnap: () => void;
}

export const useCanvasUiStore = create<CanvasUiState>((set) => ({
  machineGridSnap: true,
  toggleMachineGridSnap: () =>
    set((s) => ({ machineGridSnap: !s.machineGridSnap })),
}));
