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
import {
  machinePlacementGridSize,
  snapPointToGrid,
} from "@/constants/flowGrid";
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
import { isItemEdgeData } from "@/types/edgeData";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";
import {
  addTopologyEdge,
  buildRouteGraph,
  deleteSegment,
  emptyRouteGraph,
  portHandlesFromNodes,
  pruneRouteGraph,
  removeTopologyEdge,
  topologyEdgesFromFlow,
  followPortVertices,
  type RouteGraph,
} from "@/lib/routing";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function snapForMachine(point: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return snapPointToGrid(
    point,
    machinePlacementGridSize(useCanvasUiStore.getState().machineGridSnap),
  );
}

function rebuildRouteGraph(nodes: Node[], edges: Edge[]): RouteGraph {
  return buildRouteGraph(
    portHandlesFromNodes(nodes),
    topologyEdgesFromFlow(edges),
  );
}

function patchNewEdges(
  graph: RouteGraph,
  nodes: Node[],
  newEdges: Edge[],
): RouteGraph {
  const ports = portHandlesFromNodes(nodes);
  let g = graph;
  for (const e of newEdges) {
    const itemId = isItemEdgeData(e.data) ? e.data.itemId : "";
    if (!itemId) continue;
    g = addTopologyEdge(g, ports, {
      id: e.id,
      source: e.source,
      target: e.target,
      itemId,
    });
  }
  return g;
}

export interface DocumentState {
  nodes: Node[];
  edges: Edge[];
  routeGraph: RouteGraph;
  setRouteGraph: (g: RouteGraph) => void;
  /** Débit /min forcé par id de port (undefined = nomina recette). */
  forcedPortRates: Record<string, number | undefined>;
  solverReady: boolean;
  setSolverReady: (v: boolean) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  removeEdgeById: (edgeId: string) => void;
  /** Delete a visual segment; cascade dangling geometry and drop broken topology edges. */
  deleteRouteSegment: (segmentId: string) => void;
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
    routeGraph?: RouteGraph;
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
  routeGraph: emptyRouteGraph(),
  setRouteGraph: (routeGraph) => set({ routeGraph }),
  forcedPortRates: {},
  solverReady: false,
  reorderDragSession: null,
  setReorderDragSession: (session) => set({ reorderDragSession: session }),
  setSolverReady: (solverReady) => set({ solverReady }),
  onNodesChange: (changes) => {
    const removed = changes.some((c) => c.type === "remove");
    if (!removed) {
      set({ nodes: applyNodeChanges(changes, get().nodes) });
      return;
    }
    const s = get();
    let nodes = applyNodeChanges(changes, s.nodes);
    const alive = new Set(nodes.map((n) => n.id));
    nodes = nodes.filter((n) => !n.parentId || alive.has(n.parentId));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = s.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );
    const validPorts = new Set(
      nodes.filter((n) => n.type === "itemPort").map((n) => n.id),
    );
    const forcedPortRates = { ...s.forcedPortRates };
    for (const k of Object.keys(forcedPortRates)) {
      if (!validPorts.has(k)) delete forcedPortRates[k];
    }
    set({
      nodes,
      edges,
      forcedPortRates,
      routeGraph: pruneRouteGraph(
        s.routeGraph,
        validPorts,
        new Set(edges.map((e) => e.id)),
      ),
    });
  },
  onEdgesChange: (changes) => {
    const next = applyEdgeChanges(changes, get().edges);
    const removed = changes.some((c) => c.type === "remove");
    if (!removed) {
      set({ edges: next });
      return;
    }
    const valid = new Set(next.map((e) => e.id));
    const ports = new Set(
      get()
        .nodes.filter((n) => n.type === "itemPort")
        .map((n) => n.id),
    );
    set({
      edges: next,
      routeGraph: pruneRouteGraph(get().routeGraph, ports, valid),
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
    set({
      nodes: nextNodes,
      edges: [...get().edges, edge],
      routeGraph: addTopologyEdge(
        get().routeGraph,
        portHandlesFromNodes(nextNodes),
        { id, source: ps, target: pt, itemId },
      ),
    });
  },
  removeEdgeById: (edgeId) => {
    const s = get();
    const edge = s.edges.find((e) => e.id === edgeId);
    const nextEdges = s.edges.filter((e) => e.id !== edgeId);
    const topo = topologyEdgesFromFlow(s.edges);
    const { graph } = edge
      ? removeTopologyEdge(s.routeGraph, edgeId, topo)
      : { graph: s.routeGraph };
    set({ edges: nextEdges, routeGraph: graph });
  },
  deleteRouteSegment: (segmentId) => {
    const s = get();
    const { graph, removedEdgeIds } = deleteSegment(
      s.routeGraph,
      segmentId,
      topologyEdgesFromFlow(s.edges),
    );
    const drop = new Set(removedEdgeIds);
    set({
      routeGraph: graph,
      edges: drop.size ? s.edges.filter((e) => !drop.has(e.id)) : s.edges,
    });
  },
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
    set((s) => {
      if (hasEdgeBetweenPorts(s.edges, edge.source, edge.target)) return s;
      const edges = [...s.edges, edge];
      return {
        edges,
        routeGraph: patchNewEdges(s.routeGraph, s.nodes, [edge]),
      };
    }),
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

    const position = snapForMachine(
      computeMachineFramePosition(
        recipeKey,
        snapForMachine(flowPosition),
        placement,
      ),
    );

    const bp: MachineBlueprint = {
      id,
      position,
      label,
      recipeKey,
    };
    const built = buildMachineNodes(bp);
    let extraEdges: Edge[] = [];
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
          }
        } else {
          const sourceOut = findItemPortIdOnMachine(built, id, "out", itemId);
          if (
            sourceOut &&
            !hasEdgeBetweenPorts(get().edges, sourceOut, linkId)
          ) {
            extraEdges.push(makeItemEdge(sourceOut, linkId, itemId));
          }
        }
      }
    }
    set((s) => {
      const nodes = [...s.nodes, ...built];
      const edges = extraEdges.length ? [...s.edges, ...extraEdges] : s.edges;
      return {
        nodes,
        edges,
        routeGraph: extraEdges.length
          ? patchNewEdges(s.routeGraph, nodes, extraEdges)
          : s.routeGraph,
      };
    });
  },
  addContainer: (variant, flowPosition, options) => {
    const id = nextContainerFrameId(get().nodes);
    const position = snapForMachine(
      computeContainerFramePosition(variant, snapForMachine(flowPosition)),
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
            }
          }
        }
      }
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
    set((s) => {
      const nodes = [...s.nodes, ...nextNodes];
      const edges = extraEdges.length ? [...s.edges, ...extraEdges] : s.edges;
      return {
        nodes,
        edges,
        routeGraph: extraEdges.length
          ? patchNewEdges(s.routeGraph, nodes, extraEdges)
          : s.routeGraph,
      };
    });
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
      const validPorts = new Set(
        nodes.filter((n) => n.type === "itemPort").map((n) => n.id),
      );
      const validEdges = new Set(edges.map((e) => e.id));
      return {
        nodes,
        edges,
        forcedPortRates,
        routeGraph: pruneRouteGraph(s.routeGraph, validPorts, validEdges),
      };
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
      const validPorts = new Set(
        nodes.filter((n) => n.type === "itemPort").map((n) => n.id),
      );
      const validEdges = new Set(edges.map((e) => e.id));
      return {
        nodes,
        edges,
        forcedPortRates,
        routeGraph: pruneRouteGraph(s.routeGraph, validPorts, validEdges),
      };
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
      routeGraph: rebuildRouteGraph([...others, ...built], edges),
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
      routeGraph: rebuildRouteGraph([...others, ...built], edges),
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
    const nodes = [...others, ...built];
    set({
      nodes,
      routeGraph: followPortVertices(
        s.routeGraph,
        portHandlesFromNodes(nodes),
      ),
    });
  },
  replaceDocument: (doc) => {
    const { nodes, edges, forcedPortRates } = loadFactoryDocument(doc);
    set({
      nodes,
      edges,
      forcedPortRates,
      routeGraph: rebuildRouteGraph(nodes, edges),
      reorderDragSession: null,
    });
  },
  replaceActiveCanvas: (slice) => {
    const hasWires = slice.edges.length > 0;
    const g = slice.routeGraph;
    const keep =
      g && (g.segments.length > 0 || !hasWires)
        ? g
        : rebuildRouteGraph(slice.nodes, slice.edges);
    set({
      nodes: slice.nodes,
      edges: slice.edges,
      forcedPortRates: slice.forcedPortRates,
      routeGraph: followPortVertices(keep, portHandlesFromNodes(slice.nodes)),
      reorderDragSession: null,
    });
  },
}));
