import {
  captureCanvasSelection,
  pasteCanvasSelection,
} from "@/lib/canvasClipboard";
import type { BlueprintLibrary, BlueprintDefinition } from "@/types/blueprint";
import {
  publishBlueprint,
  blueprintFingerprint,
  recoverBlueprintLibrary,
} from "@/lib/blueprints";
import { ensureBoundaryNodes } from "@/lib/factoryBoundaries";
import { wrapCanvasSelection } from "@/lib/wrapCanvasSelection";
import { reconcileFactoryHierarchy } from "@/lib/factoryHierarchy";
import type { Edge, Node } from "@xyflow/react";
import { create } from "zustand";
import { buildFactoryNode } from "@/lib/buildFactoryGraph";
import {
  buildCanvasSubtreeExport,
  buildWorldDocument,
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
import { WORLD_CANVAS_ID, WORLD_CANVAS_NAME } from "@/types/canvas";
import type {
  CanvasSubtreeExportV1,
  FactoryDocumentV2,
} from "@/types/factoryDocument";

const NAV_ANIM_MS = 220;

export interface WorldState {
  blueprintLibrary: BlueprintLibrary;
  createBlueprint: (
    position: { x: number; y: number },
    name: string,
  ) => string | null;
  addBlueprint: (
    definitionId: string,
    position: { x: number; y: number },
  ) => string | null;
  importBlueprint: (definition: BlueprintDefinition) => void;
  setBlueprintCount: (id: string, count: number | undefined) => void;
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
  wrapSelectedMachines: (kind: "factory" | "blueprint", name?: string) => CanvasId | null;
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
  const { nodes, edges, forcedPortRates, routeGraph } =
    useDocumentStore.getState();
  const prev = canvasMap[activeCanvasId] ?? createEmptyWorldCanvas();
  return {
    ...canvasMap,
    [activeCanvasId]: {
      ...prev,
      nodes: clone ? (structuredClone(nodes) as Node[]) : nodes,
      edges: clone ? (structuredClone(edges) as Edge[]) : edges,
      forcedPortRates: clone ? { ...forcedPortRates } : forcedPortRates,
      routeGraph: clone ? structuredClone(routeGraph) : routeGraph,
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
  blueprintLibrary: {},
  canvasMap: { [WORLD_CANVAS_ID]: createEmptyWorldCanvas() },
  activeCanvasId: WORLD_CANVAS_ID,
  factoryNameCounter: 0,
  isNavigating: false,
  navigationTargetId: null,

  flushActiveCanvas: () => {
    const state = get();
    const map = persistActiveSlice(state.canvasMap, state.activeCanvasId, true);
    const active = ensureBoundaryNodes(map[state.activeCanvasId]);
    const published = publishBlueprint(active, state.blueprintLibrary);
    map[state.activeCanvasId] = published.canvas;
    set({
      blueprintLibrary: published.library,
      canvasMap: reconcileFactoryHierarchy(map, published.library),
    });
  },

  loadCanvasIntoDocument: (canvasId) => {
    const state = get();
    if (!state.canvasMap[canvasId]) return;
    const map = {
      ...state.canvasMap,
      [canvasId]: ensureBoundaryNodes(state.canvasMap[canvasId]),
    };
    const canvasMap = reconcileFactoryHierarchy(map, state.blueprintLibrary);
    set({ canvasMap });
    useDocumentStore
      .getState()
      .replaceActiveCanvas(sliceActiveCanvas(canvasMap[canvasId]));
  },

  replaceWorldDocument: (doc) => {
    const blueprintLibrary = recoverBlueprintLibrary(
      doc.canvases,
      structuredClone(doc.blueprintLibrary ?? {}),
    );
    const canvasMap = reconcileFactoryHierarchy(
      {
        ...structuredClone(doc.canvases),
        [WORLD_CANVAS_ID]: structuredClone(
          doc.canvases[WORLD_CANVAS_ID] ?? createEmptyWorldCanvas(),
        ),
      },
      blueprintLibrary,
    );
    const activeCanvasId = doc.activeCanvasId && canvasMap[doc.activeCanvasId]
      ? doc.activeCanvasId
      : WORLD_CANVAS_ID;
    set({
      canvasMap,
      blueprintLibrary,
      activeCanvasId,
      factoryNameCounter: doc.factoryNameCounter ?? 0,
      isNavigating: false,
      navigationTargetId: null,
    });
    useDocumentStore
      .getState()
      .replaceActiveCanvas(sliceActiveCanvas(canvasMap[activeCanvasId]));
  },

  toWorldDocument: () => {
    get().flushActiveCanvas();
    const { canvasMap } = get();
    return {
      ...buildWorldDocument(canvasMap, {
        updatedAt: new Date().toISOString(),
        exportTitle: "world",
      }),
      activeCanvasId: get().activeCanvasId,
      blueprintLibrary: structuredClone(get().blueprintLibrary),
    };
  },

  navigateToCanvas: async (canvasId) => {
    get().flushActiveCanvas();
    const { canvasMap, activeCanvasId } = get();
    if (canvasId === activeCanvasId || !canvasMap[canvasId]) return;

    const nextMap = canvasMap;
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

    const { nodes, edges, forcedPortRates, routeGraph } =
      useDocumentStore.getState();
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

  wrapSelectedMachines: (kind, name) => {
    const state = get();
    const map = persistActiveSlice(state.canvasMap, state.activeCanvasId);
    const selected = new Set(useDocumentStore.getState().nodes.filter((n) =>
      n.selected && (n.type === "machineFrame" || n.type === "containerFrame"),
    ).map((n) => n.id));
    const wrapped = wrapCanvasSelection(map, state.blueprintLibrary, state.activeCanvasId, selected, kind, name);
    if (!wrapped) return null;
    set({ canvasMap: wrapped.canvases, blueprintLibrary: wrapped.library });
    get().loadCanvasIntoDocument(state.activeCanvasId);
    return wrapped.id;
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
            nodes: parent.nodes.filter(
              (n) => n.id !== factoryId && n.parentId !== factoryId,
            ),
            edges: parent.edges.filter(
              (e) =>
                !parent.nodes.some(
                  (n) =>
                    n.parentId === factoryId &&
                    (n.id === e.source || n.id === e.target),
                ),
            ),
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
    const map = renameFactoryAcrossTree(get().canvasMap, factoryId, trimmed);
    const published = publishBlueprint(map[factoryId], get().blueprintLibrary);
    set({
      canvasMap: { ...map, [factoryId]: published.canvas },
      blueprintLibrary: published.library,
    });
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

    const parentCanvasId = source.parent?.canvasId;
    if (!parentCanvasId || !canAddNestedFactory(canvasMap, parentCanvasId))
      return null;
    const selection = {
      ...canvasMap,
      [parentCanvasId]: {
        ...canvasMap[parentCanvasId],
        nodes: canvasMap[parentCanvasId].nodes.map((n) => ({
          ...n,
          selected: n.id === factoryId,
        })),
        edges: canvasMap[parentCanvasId].edges.map((e) => ({
          ...e,
          selected: false,
        })),
      },
    };
    const clipboard = captureCanvasSelection(selection, parentCanvasId);
    if (!clipboard) return null;
    const next = pasteCanvasSelection(canvasMap, parentCanvasId, clipboard, {
      x: pos.x - (srcNode?.position.x ?? 0),
      y: pos.y - (srcNode?.position.y ?? 0),
    });
    const newId =
      next[parentCanvasId].nodes.find(
        (n) => n.type === "factoryFrame" && n.selected,
      )?.id ?? null;
    set({ canvasMap: next });
    if (get().activeCanvasId === parentCanvasId)
      get().loadCanvasIntoDocument(parentCanvasId);
    return newId;
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

  createBlueprint: (position, name) => {
    if (!canAddNestedFactory(get().canvasMap, get().activeCanvasId))
      return null;
    const id = get().addFactory(position);
    if (!id) return null;
    const blueprintId = `bp-${crypto.randomUUID()}`;
    const canvas = ensureBoundaryNodes({
      ...get().canvasMap[id],
      kind: "blueprint",
      blueprintId,
      name: name.trim() || "Blueprint",
    });
    const published = publishBlueprint(canvas, get().blueprintLibrary);
    set({
      blueprintLibrary: published.library,
      canvasMap: { ...get().canvasMap, [id]: published.canvas },
    });
    get().renameFactory(id, canvas.name);
    return id;
  },
  addBlueprint: (definitionId, position) => {
    const state = get();
    if (!canAddNestedFactory(state.canvasMap, state.activeCanvasId))
      return null;
    const definition = state.blueprintLibrary[definitionId];
    if (!definition) return null;
    const id = state.addFactory(position);
    if (!id) return null;
    const canvas: CanvasRecord = {
      ...structuredClone(definition.canvas),
      id,
      name: definition.name,
      parent: { canvasId: state.activeCanvasId, factoryNodeId: id },
      kind: "blueprint",
      blueprintId: definition.id,
      blueprintRevision: definition.revision,
    };
    canvas.blueprintFingerprint = blueprintFingerprint(canvas);
    set({ canvasMap: { ...get().canvasMap, [id]: canvas } });
    get().renameFactory(id, definition.name);
    return id;
  },
  importBlueprint: (definition) => {
    set({
      blueprintLibrary: {
        ...get().blueprintLibrary,
        [definition.id]: definition,
      },
    });
  },
  setBlueprintCount: (id, count) => {
    if (count !== undefined && (!Number.isFinite(count) || count < 0)) return;
    const state = useDocumentStore.getState();
    const ports = new Set(
      state.nodes.filter((n) => n.parentId === id).map((n) => n.id),
    );
    useDocumentStore.setState({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, blueprintCount: count } } : n,
      ),
      forcedPortRates: Object.fromEntries(
        Object.entries(state.forcedPortRates).filter(
          ([pid]) => !ports.has(pid),
        ),
      ),
    });
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
      blueprintLibrary: recoverBlueprintLibrary(
        merged.canvases,
        get().blueprintLibrary,
      ),
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
