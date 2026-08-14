import type { Edge, Node } from "@xyflow/react";
import { create } from "zustand";
import { buildFactoryNode } from "@/lib/buildFactoryGraph";
import {
  buildCanvasSubtreeExport,
  buildWorldDocument,
  cloneFactorySubtree,
  mergeImportedSubtree,
  renameFactoryAcrossTree,
} from "@/lib/canvasExport";
import {
  canAddNestedFactory,
  collectDescendantCanvasIds,
  createChildCanvasRecord,
  createEmptyWorldCanvas,
  getBreadcrumbPath,
  nextFactoryId,
  nextFactoryLabel,
  sliceActiveCanvas,
} from "@/lib/canvasTree";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";
import {
  machinePlacementGridSize,
  snapPointToGrid,
} from "@/constants/flowGrid";
import type { CanvasId, CanvasRecord, CanvasViewport } from "@/types/canvas";
import {
  WORLD_CANVAS_ID,
  WORLD_CANVAS_NAME,
} from "@/types/canvas";
import type {
  CanvasSubtreeExportV1,
  FactoryDocumentV2,
} from "@/types/factoryDocument";

const NAV_ANIM_MS = 220;

export interface WorldState {
  canvasMap: Record<CanvasId, CanvasRecord>;
  activeCanvasId: CanvasId;
  factoryNameCounter: number;
  isNavigating: boolean;
  navigationTargetId: CanvasId | null;

  flushActiveCanvas: () => void;
  loadCanvasIntoDocument: (canvasId: CanvasId) => void;
  replaceWorldDocument: (doc: FactoryDocumentV2) => void;
  toWorldDocument: () => FactoryDocumentV2;

  navigateToCanvas: (canvasId: CanvasId) => Promise<void>;
  getBreadcrumb: () => ReturnType<typeof getBreadcrumbPath>;
  getActiveCanvasName: () => string;
  setActiveCanvasViewport: (viewport: CanvasViewport) => void;

  addFactory: (flowPosition: { x: number; y: number }) => CanvasId | null;
  removeFactory: (factoryId: CanvasId) => void;
  renameFactory: (factoryId: CanvasId, name: string) => void;
  renameActiveCanvas: (name: string) => void;
  duplicateFactory: (
    factoryId: CanvasId,
    position?: { x: number; y: number },
  ) => CanvasId | null;
  clearActiveCanvas: () => void;

  exportWorld: () => FactoryDocumentV2;
  exportActiveSubtree: () => CanvasSubtreeExportV1 | null;
  importFactorySubtree: (
    exportDoc: CanvasSubtreeExportV1,
    position: { x: number; y: number },
  ) => CanvasId | null;
}

function persistActiveSlice(
  canvasMap: Record<CanvasId, CanvasRecord>,
  activeCanvasId: CanvasId,
  clone = false,
): Record<CanvasId, CanvasRecord> {
  const { nodes, edges, forcedPortRates, routeGraph } = useDocumentStore.getState();
  const prev = canvasMap[activeCanvasId] ?? createEmptyWorldCanvas();
  return {
    ...canvasMap,
    [activeCanvasId]: {
      ...prev,
      nodes: clone
        ? (structuredClone(nodes) as Node[])
        : nodes,
      edges: clone
        ? (structuredClone(edges) as Edge[])
        : edges,
      forcedPortRates: clone
        ? { ...forcedPortRates }
        : forcedPortRates,
      routeGraph: clone
        ? structuredClone(routeGraph)
        : routeGraph,
    },
  };
}

function viewportEqual(
  a: CanvasViewport | undefined,
  b: CanvasViewport,
): boolean {
  if (!a) return false;
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  canvasMap: { [WORLD_CANVAS_ID]: createEmptyWorldCanvas() },
  activeCanvasId: WORLD_CANVAS_ID,
  factoryNameCounter: 0,
  isNavigating: false,
  navigationTargetId: null,

  flushActiveCanvas: () => {
    set((s) => {
      const { nodes, edges, forcedPortRates, routeGraph } = useDocumentStore.getState();
      const prev = s.canvasMap[s.activeCanvasId];
      if (
        prev?.nodes === nodes &&
        prev?.edges === edges &&
        prev?.forcedPortRates === forcedPortRates &&
        prev?.routeGraph === routeGraph
      ) {
        return s;
      }
      return {
        canvasMap: persistActiveSlice(s.canvasMap, s.activeCanvasId, true),
      };
    });
  },

  loadCanvasIntoDocument: (canvasId) => {
    const record = get().canvasMap[canvasId];
    if (!record) return;
    const slice = sliceActiveCanvas(record);
    useDocumentStore.getState().replaceActiveCanvas(slice);
    set((s) => ({
      canvasMap: {
        ...s.canvasMap,
        [canvasId]: {
          ...s.canvasMap[canvasId],
          nodes: slice.nodes,
          edges: slice.edges,
          forcedPortRates: slice.forcedPortRates,
          routeGraph: slice.routeGraph,
        },
      },
    }));
  },

  replaceWorldDocument: (doc) => {
    const world = doc.canvases[WORLD_CANVAS_ID] ?? createEmptyWorldCanvas();
    const slice = sliceActiveCanvas(world);
    set({
      canvasMap: structuredClone(doc.canvases),
      activeCanvasId: WORLD_CANVAS_ID,
      factoryNameCounter: doc.factoryNameCounter ?? 0,
      isNavigating: false,
      navigationTargetId: null,
    });
    useDocumentStore.getState().replaceActiveCanvas(slice);
    set((s) => ({
      canvasMap: {
        ...s.canvasMap,
        [WORLD_CANVAS_ID]: {
          ...s.canvasMap[WORLD_CANVAS_ID],
          nodes: slice.nodes,
          edges: slice.edges,
          forcedPortRates: slice.forcedPortRates,
          routeGraph: slice.routeGraph,
        },
      },
    }));
  },

  toWorldDocument: () => {
    get().flushActiveCanvas();
    const { canvasMap } = get();
    return buildWorldDocument(canvasMap, {
      updatedAt: new Date().toISOString(),
      exportTitle: "world",
    });
  },

  navigateToCanvas: async (canvasId) => {
    const { canvasMap, activeCanvasId } = get();
    if (canvasId === activeCanvasId || !canvasMap[canvasId]) return;

    const nextMap = persistActiveSlice(canvasMap, activeCanvasId, true);
    set({
      isNavigating: true,
      navigationTargetId: canvasId,
      canvasMap: nextMap,
      activeCanvasId: canvasId,
    });
    get().loadCanvasIntoDocument(canvasId);

    await new Promise((r) => setTimeout(r, NAV_ANIM_MS));
    set({ isNavigating: false, navigationTargetId: null });
  },

  getBreadcrumb: () => getBreadcrumbPath(get().canvasMap, get().activeCanvasId),

  getActiveCanvasName: () => {
    const { canvasMap, activeCanvasId } = get();
    if (activeCanvasId === WORLD_CANVAS_ID) return WORLD_CANVAS_NAME;
    return canvasMap[activeCanvasId]?.name ?? WORLD_CANVAS_NAME;
  },

  setActiveCanvasViewport: (viewport) => {
    set((s) => {
      const prev = s.canvasMap[s.activeCanvasId];
      if (!prev || viewportEqual(prev.viewport, viewport)) return s;
      return {
        canvasMap: {
          ...s.canvasMap,
          [s.activeCanvasId]: { ...prev, viewport },
        },
      };
    });
  },

  addFactory: (flowPosition) => {
    const { activeCanvasId, canvasMap } = get();
    if (!canAddNestedFactory(canvasMap, activeCanvasId)) return null;

    const factoryId = nextFactoryId(canvasMap);
    const { label } = nextFactoryLabel(canvasMap, activeCanvasId);

    const factoryNode = buildFactoryNode(
      factoryId,
      snapPointToGrid(
        flowPosition,
        machinePlacementGridSize(useCanvasUiStore.getState().machineGridSnap),
      ),
      label,
    );
    const childCanvas = createChildCanvasRecord(
      factoryId,
      label,
      activeCanvasId,
    );

    const { nodes, edges, forcedPortRates, routeGraph } = useDocumentStore.getState();
    useDocumentStore.getState().replaceActiveCanvas({
      nodes: [...nodes, factoryNode],
      edges,
      forcedPortRates,
      routeGraph,
    });

    set((s) => ({
      canvasMap: {
        ...persistActiveSlice(s.canvasMap, activeCanvasId),
        [factoryId]: childCanvas,
      },
    }));

    return factoryId;
  },

  removeFactory: (factoryId) => {
    const ids = collectDescendantCanvasIds(get().canvasMap, factoryId);
    const { activeCanvasId } = get();

    if (ids.includes(activeCanvasId) && activeCanvasId !== WORLD_CANVAS_ID) {
      const canvas = get().canvasMap[activeCanvasId];
      const parentId = canvas?.parent?.canvasId ?? WORLD_CANVAS_ID;
      void get().navigateToCanvas(parentId);
    }

    set((s) => {
      let canvasMap = persistActiveSlice(s.canvasMap, s.activeCanvasId);
      const parentCanvasId = canvasMap[factoryId]?.parent?.canvasId;
      if (parentCanvasId && canvasMap[parentCanvasId]) {
        const parent = canvasMap[parentCanvasId];
        canvasMap = {
          ...canvasMap,
          [parentCanvasId]: {
            ...parent,
            nodes: parent.nodes.filter((n) => n.id !== factoryId),
          },
        };
      }
      for (const id of ids) {
        delete canvasMap[id];
      }
      return { canvasMap };
    });

    get().loadCanvasIntoDocument(get().activeCanvasId);
  },

  renameFactory: (factoryId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    get().flushActiveCanvas();
    set((s) => ({
      canvasMap: renameFactoryAcrossTree(s.canvasMap, factoryId, trimmed),
    }));
    get().loadCanvasIntoDocument(get().activeCanvasId);
  },

  renameActiveCanvas: (name) => {
    const { activeCanvasId } = get();
    if (activeCanvasId === WORLD_CANVAS_ID) return;
    get().renameFactory(activeCanvasId, name);
  },

  duplicateFactory: (factoryId, position) => {
    get().flushActiveCanvas();
    const { canvasMap } = get();
    const source = canvasMap[factoryId];
    if (!source) return null;

    const srcNode = findFactoryNodeInParent(canvasMap, factoryId);
    const pos = position ?? {
      x: (srcNode?.position.x ?? 0) + 32,
      y: (srcNode?.position.y ?? 0) + 32,
    };

    const cloned = cloneFactorySubtree(canvasMap, factoryId, pos);

    const parentCanvasId = source.parent?.canvasId;
    if (!parentCanvasId) return null;

    set((s) => {
      const map = persistActiveSlice(s.canvasMap, s.activeCanvasId);
      const p = map[parentCanvasId];
      return {
        canvasMap: {
          ...cloned.canvases,
          [parentCanvasId]: {
            ...p,
            nodes: [...p.nodes, cloned.node],
          },
        },
      };
    });

    if (get().activeCanvasId === parentCanvasId) {
      get().loadCanvasIntoDocument(parentCanvasId);
    }

    return cloned.newRootId;
  },

  clearActiveCanvas: () => {
    const { activeCanvasId } = get();
    const canvas = get().canvasMap[activeCanvasId];
    if (!canvas) return;

    for (const n of [...canvas.nodes]) {
      if (n.type === "factoryFrame") {
        get().removeFactory(n.id);
      }
    }

    useDocumentStore.getState().replaceActiveCanvas({
      nodes: [],
      edges: [],
      forcedPortRates: {},
    });

    set((s) => ({
      canvasMap: persistActiveSlice(s.canvasMap, activeCanvasId),
    }));
  },

  exportWorld: () => get().toWorldDocument(),

  exportActiveSubtree: () => {
    get().flushActiveCanvas();
    const { canvasMap, activeCanvasId } = get();
    if (activeCanvasId === WORLD_CANVAS_ID) return null;
    return buildCanvasSubtreeExport(canvasMap, activeCanvasId);
  },

  importFactorySubtree: (exportDoc, position) => {
    get().flushActiveCanvas();
    const { canvasMap, activeCanvasId } = get();
    if (!canAddNestedFactory(canvasMap, activeCanvasId)) return null;

    const merged = mergeImportedSubtree(
      canvasMap,
      activeCanvasId,
      exportDoc,
      position,
    );

    set({
      canvasMap: merged.canvases,
    });

    get().loadCanvasIntoDocument(activeCanvasId);
    return merged.newRootId;
  },
}));

function findFactoryNodeInParent(
  canvasMap: Record<CanvasId, CanvasRecord>,
  factoryId: CanvasId,
): Node | undefined {
  const canvas = canvasMap[factoryId];
  const parentId = canvas?.parent?.canvasId;
  if (!parentId) return undefined;
  return canvasMap[parentId]?.nodes.find((n) => n.id === factoryId);
}
