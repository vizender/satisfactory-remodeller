import { create } from "zustand";
import type { LabSceneId } from "./scenes";

export interface RoutingLabState {
  sceneId: LabSceneId;
  selectedSegmentIds: string[];
  debug: boolean;
  setSceneId: (id: LabSceneId) => void;
  setSelectedSegmentIds: (ids: string[]) => void;
  toggleDebug: () => void;
}

export const useRoutingLabStore = create<RoutingLabState>((set) => ({
  sceneId: 1,
  selectedSegmentIds: [],
  debug: false,
  setSceneId: (sceneId) => set({ sceneId, selectedSegmentIds: [] }),
  setSelectedSegmentIds: (selectedSegmentIds) => set({ selectedSegmentIds }),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));
