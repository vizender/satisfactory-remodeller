import { create } from "zustand";

interface CanvasUiState {
  /** When true, connected ports snap to horizontal alignment when close. */
  rigidPortSnap: boolean;
  toggleRigidPortSnap: () => void;
}

export const useCanvasUiStore = create<CanvasUiState>((set) => ({
  rigidPortSnap: true,
  toggleRigidPortSnap: () =>
    set((s) => ({ rigidPortSnap: !s.rigidPortSnap })),
}));
