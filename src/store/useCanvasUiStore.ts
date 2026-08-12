import { create } from "zustand";

export type EdgeRoutingMode = "bezier" | "orthogonal";

export const EDGE_ROUTING_STORAGE_KEY = "remodeller:edgeRoutingMode";

function readStoredRoutingMode(): EdgeRoutingMode {
  try {
    const v = localStorage.getItem(EDGE_ROUTING_STORAGE_KEY);
    if (v === "orthogonal" || v === "bezier") return v;
  } catch {
    /* ignore */
  }
  return "bezier";
}

function writeStoredRoutingMode(mode: EdgeRoutingMode) {
  try {
    localStorage.setItem(EDGE_ROUTING_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

interface CanvasUiState {
  /** When true, connected ports snap to horizontal alignment when close. */
  rigidPortSnap: boolean;
  toggleRigidPortSnap: () => void;
  /** Global curved vs orthogonal edge rendering. */
  edgeRoutingMode: EdgeRoutingMode;
  setEdgeRoutingMode: (mode: EdgeRoutingMode) => void;
  toggleEdgeRoutingMode: () => void;
}

export const useCanvasUiStore = create<CanvasUiState>((set, get) => ({
  rigidPortSnap: true,
  toggleRigidPortSnap: () =>
    set((s) => ({ rigidPortSnap: !s.rigidPortSnap })),
  edgeRoutingMode: readStoredRoutingMode(),
  setEdgeRoutingMode: (mode) => {
    writeStoredRoutingMode(mode);
    set({ edgeRoutingMode: mode });
  },
  toggleEdgeRoutingMode: () => {
    const next: EdgeRoutingMode =
      get().edgeRoutingMode === "orthogonal" ? "bezier" : "orthogonal";
    writeStoredRoutingMode(next);
    set({ edgeRoutingMode: next });
  },
}));
