import type { Connection, Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { create } from "zustand";
import {
  buildContainerNodes,
  computeContainerFramePosition,
  containerBlueprintFromFrame,
  type ContainerBlueprint,
} from "@/lib/buildContainerGraph";
import {
  applyContainerItemAssignment,
} from "@/lib/containerPortAssign";
import { CONTAINER_DEFAULT_LABEL } from "@/constants/container";
import { snapPointToGrid } from "@/constants/flowGrid";
import { snapBuiltFrameToLinkOrigin } from "@/lib/rigidPortSnap";
import type { ContainerVariant } from "@/types/graph";
import {
  buildMachineNodes,
  computeMachineFramePosition,
  machineBlueprintFromFrame,
  normalizePortSlotPermutation,
  type MachineBlueprint,
  type MachinePlacementAnchor,
} from "@/lib/buildMachineGraph";
import type { ReorderDragSession } from "@/lib/nodeDisplayDecorators";
import { clampClockPercent } from "@/lib/clockSpeed";
import { defaultMachineInstanceLabel } from "@/lib/recipeFilters";
import { loadFactoryDocument } from "@/lib/factoryDocument";
import { findRecipeByKey } from "@/lib/recipeLookup";
import type { FactoryDocumentV2 } from "@/types/factoryDocument";
import type { ItemPortData, MachineFrameData } from "@/types/graph";
import {
  isPortItemAssigned,
  portItemsCompatible,
} from "@/types/graph";
import type { ItemEdgeData } from "@/types/edgeData";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export interface DocumentState {
  nodes: Node[];
  edges: Edge[];
  /** Débit /min forcé par id de port (undefined = nomina recette). */
  forcedPortRates: Record<string, number | undefined>;
  solverReady: boolean;
  setSolverReady: (v: boolean) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  removeEdgeById: (edgeId: string) => void;
  /** Orthogonal mode: set / clear the vertical segment X (undefined = auto). */
  setEdgeBendX: (edgeId: string, bendX: number | undefined) => void;
  /**
   * Orthogonal mode: set / clear multi-segment route.
   * Pass live handle positions as `anchor` so corners are stored as fractions.
   */
  setEdgeCorners: (
    edgeId: string,
    corners: import("@/types/edgeData").OrthoPoint[] | undefined,
    anchor?: import("@/types/edgeData").RouteAnchor,
    lockedVerticals?: import("@/types/edgeData").LockedVertical[],
  ) => void;
  /** Update intersection locks without rewriting the route geometry. */
  setEdgeLockedVerticalXs: (
    edgeId: string,
    lockedVerticals: import("@/types/edgeData").LockedVertical[],
  ) => void;
  setForcedPortRate: (portId: string, ratePerMin: number | undefined) => void;
  /** Retire tous les overrides sur les ports d’une machine (cadre). */
  clearForcedOnMachine: (machineFrameId: string) => void;
  clearForcedOnContainer: (containerFrameId: string) => void;
  setContainerOutputEnabled: (
    containerFrameId: string,
    outputEnabled: boolean,
  ) => void;
  setContainerVariant: (
    containerFrameId: string,
    variant: ContainerVariant,
  ) => void;
  addResolvedEdge: (edge: Edge) => void;
  /**
   * Nouvelle machine à `flowPosition`.
   * Si `linkOriginPortId` est le port depuis lequel on a lâché la connexion / le drag,
   * on crée une arête vers l’entrée ou la sortie correspondante sur la nouvelle machine.
   */
  addMachine: (
    recipeKey: string,
    flowPosition: { x: number; y: number },
    options?: { linkOriginPortId?: string },
  ) => void;
  addContainer: (
    variant: ContainerVariant,
    flowPosition: { x: number; y: number },
    options?: { linkOriginPortId?: string },
  ) => void;
  /** Supprime le cadre, les ports et toutes les arêtes attachées. */
  removeMachine: (machineFrameId: string) => void;
  removeContainer: (containerFrameId: string) => void;
  /** Remplace la recette et retire les liaisons / forçages devenus invalides. */
  setMachineRecipe: (machineFrameId: string, recipeKey: string) => void;
  /** Surclock 0–250 % (défaut 100). */
  setMachineClockPercent: (machineFrameId: string, clockPercent: number) => void;
  /** Repositionne un nœud (ex. aperçu vertical lors du réordonnancement des ports). */
  setNodePosition: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
  /** Plusieurs positions en une mise à jour (aperçu swap / reset des ports). */
  setNodePositions: (
    updates: { id: string; position: { x: number; y: number } }[],
  ) => void;
  /** Session active de réordonnancement vertical (classes CSS de transition). */
  reorderDragSession: ReorderDragSession | null;
  setReorderDragSession: (session: ReorderDragSession | null) => void;
  /**
   * Échange les créneaux verticaux de deux ports (même côté) pour réduire les croisements.
   * Les ids de ports (`…-in-i` / `…-out-i`) restent alignés sur l’index recette.
   */
  swapMachinePortSlots: (
    machineFrameId: string,
    kind: "in" | "out",
    recipeIndex: number,
    targetSlotIndex: number,
  ) => void;
  /** Remplace le graphe (import JSON / brouillon local). */
  replaceDocument: (doc: FactoryDocumentV2) => void;
  /** Met à jour la vue du canvas actif (navigation / sync monde). */
  replaceActiveCanvas: (slice: {
    nodes: Node[];
    edges: Edge[];
    forcedPortRates: Record<string, number | undefined>;
  }) => void;
}

function portIdsForFrame(nodes: Node[], frameId: string): string[] {
  return nodes
    .filter((n) => n.type === "itemPort" && n.parentId === frameId)
    .map((n) => n.id);
}

function portIdsForMachine(
  nodes: Node[],
  machineId: string,
): string[] {
  return portIdsForFrame(nodes, machineId);
}

function nextContainerFrameId(nodes: Node[]): string {
  let max = 0;
  for (const n of nodes) {
    if (n.type !== "containerFrame") continue;
    const m = /^c(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `c${max + 1}`;
}

function containerOutputDisabled(
  nodes: Node[],
  portId: string,
): boolean {
  const port = nodes.find((n) => n.id === portId && n.type === "itemPort");
  if (!port?.parentId) return false;
  const frame = nodes.find(
    (n) => n.id === port.parentId && n.type === "containerFrame",
  );
  if (!frame) return false;
  const d = port.data as ItemPortData;
  if (d.kind !== "out") return false;
  return (frame.data as { outputEnabled?: boolean }).outputEnabled === false;
}

function nextMachineFrameId(nodes: Node[]): string {
  let max = 0;
  for (const n of nodes) {
    if (n.type !== "machineFrame") continue;
    const m = /^m(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `m${max + 1}`;
}

function findItemPortIdOnMachine(
  nodes: Node[],
  machineFrameId: string,
  kind: "in" | "out",
  itemId: string,
): string | null {
  for (const n of nodes) {
    if (n.type !== "itemPort" || n.parentId !== machineFrameId) continue;
    const d = n.data as ItemPortData;
    if (d.kind === kind && d.itemId === itemId) return n.id;
  }
  return null;
}

function makeItemEdge(source: string, target: string, itemId: string): Edge {
  const id = `e-${source}-${target}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    source,
    target,
    sourceHandle: "item",
    targetHandle: "item",
    data: { itemId },
  };
}

/** Une seule liaison matière entre deux ports donnés (évite doublons / glitch visuel). */
export function hasEdgeBetweenPorts(
  edges: Edge[],
  sourcePortId: string,
  targetPortId: string,
): boolean {
  return edges.some(
    (e) => e.source === sourcePortId && e.target === targetPortId,
  );
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  forcedPortRates: {},
  solverReady: false,
  reorderDragSession: null,
  setReorderDragSession: (session) => set({ reorderDragSession: session }),
  setSolverReady: (solverReady) => set({ solverReady }),
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection) => {
    const nodes = get().nodes;
    const src = nodes.find((n) => n.id === connection.source);
    const tgt = nodes.find((n) => n.id === connection.target);
    if (
      !src ||
      !tgt ||
      src.type !== "itemPort" ||
      tgt.type !== "itemPort"
    ) {
      return;
    }
    const sd = src.data as ItemPortData;
    const td = tgt.data as ItemPortData;
    if (sd.kind !== "out" || td.kind !== "in") return;
    if (!portItemsCompatible(sd.itemId, td.itemId)) return;
    const itemId = isPortItemAssigned(sd.itemId) ? sd.itemId : td.itemId;
    if (!isPortItemAssigned(itemId)) return;
    if (containerOutputDisabled(nodes, connection.source!)) return;
    const ps = connection.source;
    const pt = connection.target;
    if (!ps || !pt || hasEdgeBetweenPorts(get().edges, ps, pt)) {
      return;
    }
    const id = `e-${connection.source}-${connection.target}-${crypto.randomUUID().slice(0, 8)}`;
    const edge: Edge = {
      id,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? "item",
      targetHandle: connection.targetHandle ?? "item",
      data: { itemId },
    };
    const nextNodes = applyContainerItemAssignment(
      nodes,
      connection.source!,
      connection.target!,
      itemId,
    );
    set({ nodes: nextNodes, edges: [...get().edges, edge] });
  },
  removeEdgeById: (edgeId) =>
    set({ edges: get().edges.filter((e) => e.id !== edgeId) }),
  setEdgeBendX: (edgeId, bendX) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const prev = (e.data ?? {}) as ItemEdgeData;
        const next: ItemEdgeData = { ...prev };
        if (bendX === undefined || Number.isNaN(bendX)) {
          delete next.bendX;
          delete next.corners;
          delete next.cornersNorm;
          delete next.routeAnchor;
          delete next.lockedVerticalXs;
          delete next.lockedVerticals;
        } else {
          next.bendX = bendX;
          delete next.corners;
          delete next.cornersNorm;
          delete next.routeAnchor;
          delete next.lockedVerticalXs;
          delete next.lockedVerticals;
        }
        return { ...e, data: next };
      }),
    })),
  setEdgeCorners: (edgeId, corners, anchor, lockedVerticals) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const prev = (e.data ?? {}) as ItemEdgeData;
        const next: ItemEdgeData = { ...prev };
        if (!corners || corners.length < 2 || !anchor) {
          delete next.corners;
          delete next.cornersNorm;
          delete next.bendX;
          delete next.routeAnchor;
          delete next.lockedVerticalXs;
          delete next.lockedVerticals;
        } else {
          const dx = anchor.tx - anchor.sx;
          const dy = anchor.ty - anchor.sy;
          next.cornersNorm = corners.map((p) => ({
            u: Math.abs(dx) < 1e-6 ? 0.5 : (p.x - anchor.sx) / dx,
            v: Math.abs(dy) < 1e-6 ? 0.5 : (p.y - anchor.sy) / dy,
          }));
          next.routeAnchor = { ...anchor };
          if (lockedVerticals && lockedVerticals.length > 0) {
            next.lockedVerticals = lockedVerticals.map((l) => ({
              x: l.x,
              ord: l.ord,
            }));
            next.lockedVerticalXs = lockedVerticals.map((l) => l.x);
          } else {
            delete next.lockedVerticals;
            delete next.lockedVerticalXs;
          }
          delete next.corners;
          delete next.bendX;
        }
        return { ...e, data: next };
      }),
    })),
  setEdgeLockedVerticalXs: (edgeId, lockedVerticals) =>
    set((s) => ({
      edges: s.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const prev = (e.data ?? {}) as ItemEdgeData;
        const next: ItemEdgeData = { ...prev };
        if (lockedVerticals.length > 0) {
          next.lockedVerticals = lockedVerticals.map((l) => ({
            x: l.x,
            ord: l.ord,
          }));
          next.lockedVerticalXs = lockedVerticals.map((l) => l.x);
        } else {
          delete next.lockedVerticals;
          delete next.lockedVerticalXs;
        }
        return { ...e, data: next };
      }),
    })),
  setForcedPortRate: (portId, ratePerMin) =>
    set((s) => {
      const next = { ...s.forcedPortRates };
      if (ratePerMin === undefined || Number.isNaN(ratePerMin)) {
        delete next[portId];
      } else {
        next[portId] = ratePerMin;
      }
      return { forcedPortRates: next };
    }),
  clearForcedOnMachine: (machineFrameId) =>
    set((s) => {
      const ids = new Set(portIdsForMachine(s.nodes, machineFrameId));
      const next = { ...s.forcedPortRates };
      for (const k of Object.keys(next)) {
        if (ids.has(k)) delete next[k];
      }
      return { forcedPortRates: next };
    }),
  clearForcedOnContainer: (containerFrameId) =>
    set((s) => {
      const ids = new Set(portIdsForFrame(s.nodes, containerFrameId));
      const next = { ...s.forcedPortRates };
      for (const k of Object.keys(next)) {
        if (ids.has(k)) delete next[k];
      }
      return { forcedPortRates: next };
    }),
  addResolvedEdge: (edge) =>
    set((s) =>
      hasEdgeBetweenPorts(s.edges, edge.source, edge.target)
        ? s
        : { edges: [...s.edges, edge] },
    ),
  addMachine: (recipeKey, flowPosition, options) => {
    const recipe = findRecipeByKey(recipeKey);
    const id = nextMachineFrameId(get().nodes);
    const label = defaultMachineInstanceLabel(recipe ?? undefined, id);

    let placement: MachinePlacementAnchor = { mode: "frameCenter" };
    const linkId = options?.linkOriginPortId;
    if (linkId) {
      const origin = get().nodes.find((n) => n.id === linkId);
      if (origin?.type === "itemPort") {
        const od = origin.data as ItemPortData;
        if (od.kind === "out") {
          placement = { mode: "portCenter", kind: "in", itemId: od.itemId };
        } else {
          placement = { mode: "portCenter", kind: "out", itemId: od.itemId };
        }
      }
    }

    const position = computeMachineFramePosition(
      recipeKey,
      snapPointToGrid(flowPosition),
      placement,
    );

    const bp: MachineBlueprint = {
      id,
      position,
      label,
      recipeKey,
    };
    const built = buildMachineNodes(bp);
    let extraEdges: Edge[] = [];
    let connectedPortId: string | null = null;
    if (linkId) {
      const origin = get().nodes.find((n) => n.id === linkId);
      if (origin?.type === "itemPort") {
        const od = origin.data as ItemPortData;
        const itemId = od.itemId;
        if (od.kind === "out") {
          const targetIn = findItemPortIdOnMachine(built, id, "in", itemId);
          if (
            targetIn &&
            !hasEdgeBetweenPorts(get().edges, linkId, targetIn)
          ) {
            extraEdges.push(makeItemEdge(linkId, targetIn, itemId));
            connectedPortId = targetIn;
          }
        } else {
          const sourceOut = findItemPortIdOnMachine(built, id, "out", itemId);
          if (
            sourceOut &&
            !hasEdgeBetweenPorts(get().edges, sourceOut, linkId)
          ) {
            extraEdges.push(makeItemEdge(sourceOut, linkId, itemId));
            connectedPortId = sourceOut;
          }
        }
      }
    }
    if (
      linkId &&
      connectedPortId &&
      useCanvasUiStore.getState().rigidPortSnap
    ) {
      snapBuiltFrameToLinkOrigin(
        built,
        id,
        linkId,
        connectedPortId,
        get().nodes,
      );
    }
    set((s) => ({
      nodes: [...s.nodes, ...built],
      edges: extraEdges.length ? [...s.edges, ...extraEdges] : s.edges,
    }));
  },
  addContainer: (variant, flowPosition, options) => {
    const id = nextContainerFrameId(get().nodes);
    const position = computeContainerFramePosition(
      variant,
      snapPointToGrid(flowPosition),
    );
    const bp: ContainerBlueprint = {
      id,
      position,
      label: CONTAINER_DEFAULT_LABEL[variant],
      variant,
      outputEnabled: true,
    };
    const built = buildContainerNodes(bp);
    let extraEdges: Edge[] = [];
    let connectedPortId: string | null = null;
    const linkId = options?.linkOriginPortId;
    if (linkId) {
      const origin = get().nodes.find((n) => n.id === linkId);
      if (origin?.type === "itemPort") {
        const od = origin.data as ItemPortData;
        const itemId = od.itemId;
        if (isPortItemAssigned(itemId)) {
          if (od.kind === "out") {
            const targetIn = built.find(
              (n) =>
                n.type === "itemPort" &&
                n.parentId === id &&
                (n.data as ItemPortData).kind === "in" &&
                portItemsCompatible((n.data as ItemPortData).itemId, itemId),
            );
            if (
              targetIn &&
              !hasEdgeBetweenPorts(get().edges, linkId, targetIn.id)
            ) {
              extraEdges.push(makeItemEdge(linkId, targetIn.id, itemId));
              connectedPortId = targetIn.id;
            }
          } else {
            const sourceOut = built.find(
              (n) =>
                n.type === "itemPort" &&
                n.parentId === id &&
                (n.data as ItemPortData).kind === "out" &&
                portItemsCompatible((n.data as ItemPortData).itemId, itemId),
            );
            if (
              sourceOut &&
              !hasEdgeBetweenPorts(get().edges, sourceOut.id, linkId)
            ) {
              extraEdges.push(makeItemEdge(sourceOut.id, linkId, itemId));
              connectedPortId = sourceOut.id;
            }
          }
        }
      }
    }
    if (
      linkId &&
      connectedPortId &&
      useCanvasUiStore.getState().rigidPortSnap
    ) {
      snapBuiltFrameToLinkOrigin(
        built,
        id,
        linkId,
        connectedPortId,
        get().nodes,
      );
    }
    let nextNodes = built;
    for (const e of extraEdges) {
      nextNodes = applyContainerItemAssignment(
        nextNodes,
        e.source,
        e.target,
        e.data?.itemId as string,
      );
    }
    set((s) => ({
      nodes: [...s.nodes, ...nextNodes],
      edges: extraEdges.length ? [...s.edges, ...extraEdges] : s.edges,
    }));
  },
  removeMachine: (machineFrameId) => {
    const portIds = new Set(portIdsForMachine(get().nodes, machineFrameId));
    set((s) => {
      const nodes = s.nodes.filter(
        (n) => n.id !== machineFrameId && n.parentId !== machineFrameId,
      );
      const edges = s.edges.filter(
        (e) => !portIds.has(e.source) && !portIds.has(e.target),
      );
      const forcedPortRates = { ...s.forcedPortRates };
      for (const pid of portIds) delete forcedPortRates[pid];
      return { nodes, edges, forcedPortRates };
    });
  },
  removeContainer: (containerFrameId) => {
    const portIds = new Set(portIdsForFrame(get().nodes, containerFrameId));
    set((s) => {
      const nodes = s.nodes.filter(
        (n) => n.id !== containerFrameId && n.parentId !== containerFrameId,
      );
      const edges = s.edges.filter(
        (e) => !portIds.has(e.source) && !portIds.has(e.target),
      );
      const forcedPortRates = { ...s.forcedPortRates };
      for (const pid of portIds) delete forcedPortRates[pid];
      return { nodes, edges, forcedPortRates };
    });
  },
  setContainerOutputEnabled: (containerFrameId, outputEnabled) => {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== containerFrameId || n.type !== "containerFrame") {
          return n;
        }
        const d = n.data as import("@/types/graph").ContainerFrameData;
        return {
          ...n,
          data: { ...d, outputEnabled } satisfies typeof d,
        };
      }),
    }));
  },
  setContainerVariant: (containerFrameId, variant) => {
    const s = get();
    const frame = s.nodes.find(
      (n) => n.id === containerFrameId && n.type === "containerFrame",
    );
    if (!frame) return;
    const portIds = new Set(portIdsForFrame(s.nodes, containerFrameId));
    const bp = containerBlueprintFromFrame(frame, s.nodes);
    bp.variant = variant;
    const built = buildContainerNodes(bp);
    const others = s.nodes.filter(
      (n) => n.id !== containerFrameId && n.parentId !== containerFrameId,
    );
    const edges = s.edges.filter(
      (e) => !portIds.has(e.source) && !portIds.has(e.target),
    );
    const forcedPortRates = { ...s.forcedPortRates };
    for (const pid of portIds) delete forcedPortRates[pid];
    set({
      nodes: [...others, ...built],
      edges,
      forcedPortRates,
    });
  },
  setMachineRecipe: (machineFrameId, recipeKey) => {
    const s = get();
    const frame = s.nodes.find(
      (n) => n.id === machineFrameId && n.type === "machineFrame",
    );
    if (!frame) return;
    const portIds = new Set(portIdsForMachine(s.nodes, machineFrameId));
    const recipe = findRecipeByKey(recipeKey);
    const prevLabel = (frame.data as MachineFrameData).label;
    const label =
      typeof prevLabel === "string" && prevLabel.length > 0
        ? prevLabel
        : defaultMachineInstanceLabel(recipe ?? undefined, machineFrameId);
    const prevClock = (frame.data as MachineFrameData).clockPercent;
    const bp: MachineBlueprint = {
      id: machineFrameId,
      position: { ...frame.position },
      label,
      recipeKey,
      clockPercent: typeof prevClock === "number" ? prevClock : undefined,
    };
    const built = buildMachineNodes(bp);
    const others = s.nodes.filter(
      (n) => n.id !== machineFrameId && n.parentId !== machineFrameId,
    );
    const edges = s.edges.filter(
      (e) => !portIds.has(e.source) && !portIds.has(e.target),
    );
    const forcedPortRates = { ...s.forcedPortRates };
    for (const pid of portIds) delete forcedPortRates[pid];
    set({
      nodes: [...others, ...built],
      edges,
      forcedPortRates,
    });
  },
  setMachineClockPercent: (machineFrameId, clockPercent) => {
    const v = clampClockPercent(clockPercent);
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== machineFrameId || n.type !== "machineFrame") return n;
        const d = n.data as MachineFrameData;
        return {
          ...n,
          data: { ...d, clockPercent: v } satisfies MachineFrameData,
        };
      }),
    }));
  },
  setNodePosition: (nodeId, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { ...position } } : n,
      ),
    })),
  setNodePositions: (updates) => {
    if (updates.length === 0) return;
    set((s) => {
      const m = new Map(
        updates.map((u) => [u.id, u.position] as const),
      );
      return {
        nodes: s.nodes.map((n) => {
          const p = m.get(n.id);
          return p ? { ...n, position: { ...p } } : n;
        }),
      };
    });
  },
  swapMachinePortSlots: (machineFrameId, kind, recipeIndex, targetSlotIndex) => {
    const s = get();
    const frame = s.nodes.find(
      (n) => n.id === machineFrameId && n.type === "machineFrame",
    );
    if (!frame) return;
    const recipe = findRecipeByKey((frame.data as MachineFrameData).recipeKey);
    if (!recipe) return;
    const n =
      kind === "in" ? recipe.ingredients.length : recipe.products.length;
    if (n <= 1) return;
    if (targetSlotIndex < 0 || targetSlotIndex >= n) return;

    const bp = machineBlueprintFromFrame(frame);
    const key =
      kind === "in" ? "inputSlotByRecipeIndex" : "outputSlotByRecipeIndex";
    const prev =
      kind === "in" ? bp.inputSlotByRecipeIndex : bp.outputSlotByRecipeIndex;
    const perm = normalizePortSlotPermutation(n, prev);
    if (perm[recipeIndex] === targetSlotIndex) return;
    const j = perm.findIndex((slot) => slot === targetSlotIndex);
    if (j < 0) return;
    const nextPerm = [...perm];
    [nextPerm[recipeIndex], nextPerm[j]] = [
      nextPerm[j],
      nextPerm[recipeIndex],
    ];

    const built = buildMachineNodes({
      ...bp,
      [key]: nextPerm,
    });
    const others = s.nodes.filter(
      (node) => node.id !== machineFrameId && node.parentId !== machineFrameId,
    );
    set({ nodes: [...others, ...built] });
  },
  replaceDocument: (doc) => {
    const { nodes, edges, forcedPortRates } = loadFactoryDocument(doc);
    set({
      nodes,
      edges,
      forcedPortRates,
      reorderDragSession: null,
    });
  },
  replaceActiveCanvas: (slice) => {
    set({
      nodes: slice.nodes,
      edges: slice.edges,
      forcedPortRates: slice.forcedPortRates,
      reorderDragSession: null,
    });
  },
}));
