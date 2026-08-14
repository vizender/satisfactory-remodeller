import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnConnectStartParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  BACKGROUND_GRID_GAP,
  MACHINE_SNAP_GRID,
} from "@/constants/flowGrid";
import { EdgeContextMenu } from "@/components/EdgeContextMenu";
import { CanvasTransitionOverlay } from "@/components/CanvasTransitionOverlay";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { FactoryContextMenu } from "@/components/FactoryContextMenu";
import { ContainerFrameNode } from "@/components/ContainerFrameNode";
import { ContainerContextMenu } from "@/components/ContainerContextMenu";
import { FactoryFrameNode } from "@/components/FactoryFrameNode";
import { HiddenTopologyEdge } from "@/components/routing/HiddenTopologyEdge";
import { RouteOverlay } from "@/components/routing/RouteOverlay";
import { ItemPortNode } from "@/components/ItemPortNode";
import { MachineContextMenu } from "@/components/MachineContextMenu";
import { MachineRecipePicker } from "@/components/MachineRecipePicker";
import { MachineFrameNode } from "@/components/MachineFrameNode";
import { useFlowSolveResult } from "@/hooks/useFlowSolve";
import { useTutorialGates } from "@/hooks/useTutorialGates";
import {
  reactFlowInteractionProps,
  useInputModality,
} from "@/hooks/useInputModality";
import { useTutorialStore } from "@/store/useTutorialStore";
import { useI18n } from "@/i18n/I18nProvider";
import { handleSuppressNativeContextMenu } from "@/hooks/useSuppressNativeContextMenu";
import type { RecipeFilter } from "@/lib/recipeFilters";
import {
  applyConnectionPreviewToNodes,
  applyReorderTransitionToNodes,
  type ConnectionDragPreview,
} from "@/lib/nodeDisplayDecorators";
import { applySolverConflictToEdges } from "@/lib/solverDisplayDecorators";
import { createSolverWorker, pingSolver } from "@/lib/solverClient";
import {
  cloneRouteGraph,
  dragSegment,
  followPortVertices,
  kinkSegment,
  netIdsTouchingPorts,
  nextSegmentSelection,
  portHandlesFromNodes,
  sanitizeRouteGraph,
  segmentEdgeUsers,
  topologyEdgesFromFlow,
  type DragSnapOpts,
  type Point,
  type RouteGraph,
} from "@/lib/routing";
import {
  applyMachineSelection,
  clearMachineSelection,
} from "@/lib/machineSelection";
import { CLOCK_DEFAULT, clampClockPercent } from "@/lib/clockSpeed";
import {
  hasEdgeBetweenPorts,
  useDocumentStore,
} from "@/store/useDocumentStore";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";
import { useWorldStore } from "@/store/useWorldStore";
import type {
  ContainerFrameData,
  FactoryFrameData,
  ItemPortData,
  MachineFrameData,
} from "@/types/graph";
import {
  isPortItemAssigned,
  itemPortDisplayName,
  portItemsCompatible,
} from "@/types/graph";

const nodeTypes: NodeTypes = {
  machineFrame: MachineFrameNode,
  itemPort: ItemPortNode,
  factoryFrame: FactoryFrameNode,
  containerFrame: ContainerFrameNode,
};

const edgeTypes: EdgeTypes = {
  default: HiddenTopologyEdge,
};

function clientXY(ev: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("clientX" in ev) return { x: ev.clientX, y: ev.clientY };
  const t = ev.changedTouches?.[0];
  return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
}

function isPortForceInputTarget(target: EventTarget | null) {
  return (target as HTMLElement | null)?.closest?.("[data-port-force-field]");
}

type RecipePickerState = {
  anchor: { x: number; y: number };
  flowPosition: { x: number; y: number };
  filter: RecipeFilter;
  subtitle?: string;
  replaceMachineId?: string;
  /** Port depuis lequel on a ouvert le picker (connexion vers le volet / clic droit port). */
  linkOriginPortId?: string;
};

/**
 * Après un relâchement sur le volet, le navigateur envoie un `click` sur le pane.
 * `onPaneClick` ferme le picker ; si on ouvre en synchrone dans `onConnectEnd`,
 * le click efface l’état tout de suite. Un macrotask diffère l’ouverture après ce click.
 */
function scheduleRecipePickerOpen(
  setRecipePicker: Dispatch<SetStateAction<RecipePickerState | null>>,
  value: RecipePickerState,
) {
  window.setTimeout(() => setRecipePicker(value), 0);
}

function EdgeMenuHost({
  menu,
  edges,
  onDismiss,
}: {
  menu: {
    x: number;
    y: number;
    edgeId: string;
  } | null;
  edges: Edge[];
  onDismiss: () => void;
}) {
  const { fitView, getNode } = useReactFlow();
  const removeEdgeById = useDocumentStore((s) => s.removeEdgeById);

  if (!menu) return null;

  const edge = edges.find((e) => e.id === menu.edgeId);

  const handleBranch = () => {
    if (!edge) return;
    const src = getNode(edge.source);
    if (src) fitView({ nodes: [src], duration: 650, padding: 0.45 });
  };

  const handleDelete = () => {
    if (!edge) return;
    removeEdgeById(edge.id);
  };

  return createPortal(
    <EdgeContextMenu
      x={menu.x}
      y={menu.y}
      onClose={onDismiss}
      onBranch={handleBranch}
      onDelete={handleDelete}
    />,
    document.body,
  );
}

function FlowCanvasInner() {
  const { t } = useI18n();
  const { effective: inputModality } = useInputModality();
  const flowInteraction = reactFlowInteractionProps(inputModality);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const nodes = useDocumentStore((s) => s.nodes);
  const machineGridSnap = useCanvasUiStore((s) => s.machineGridSnap);
  const reorderDragSession = useDocumentStore((s) => s.reorderDragSession);
  const edges = useDocumentStore((s) => s.edges);
  const routeGraph = useDocumentStore((s) => s.routeGraph);
  const setRouteGraph = useDocumentStore((s) => s.setRouteGraph);
  const deleteRouteSegment = useDocumentStore((s) => s.deleteRouteSegment);
  const onNodesChange = useDocumentStore((s) => s.onNodesChange);
  const applyEdgesChange = useDocumentStore((s) => s.onEdgesChange);
  const storeOnConnect = useDocumentStore((s) => s.onConnect);

  const [connectionPreview, setConnectionPreview] =
    useState<ConnectionDragPreview | null>(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const machineDrag = useRef<{ snapshot: RouteGraph } | null>(null);

  const solve = useFlowSolveResult();
  const tutorialGates = useTutorialGates();
  const tutorialActive = useTutorialStore((s) => s.active);

  const displayNodes = useMemo(() => {
    let next = nodes;
    next = applyConnectionPreviewToNodes(next, connectionPreview);
    next = applyReorderTransitionToNodes(next, reorderDragSession);
    return next;
  }, [nodes, connectionPreview, reorderDragSession]);

  const displayEdges = useMemo(
    () => applySolverConflictToEdges(edges, solve.conflictEdgeIds),
    [edges, solve.conflictEdgeIds],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (tutorialActive && !tutorialGates.allowFreeConnect) return;
      storeOnConnect(c);
      setConnectionPreview(null);
    },
    [storeOnConnect, tutorialActive, tutorialGates.allowFreeConnect],
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      setSelectedSegmentIds([]);
      if (
        tutorialActive &&
        !tutorialGates.allowPortLinkDrag &&
        !tutorialGates.allowFreeConnect
      ) {
        return;
      }
      const nid = params.nodeId;
      if (!nid || params.handleType === null) {
        setConnectionPreview(null);
        return;
      }
      const list = useDocumentStore.getState().nodes;
      const node = list.find((n) => n.id === nid);
      if (!node || node.type !== "itemPort") {
        setConnectionPreview(null);
        return;
      }
      const portData = node.data as ItemPortData;
      const fromOutput = params.handleType === "source";
      setConnectionPreview({
        sourcePortId: nid,
        itemId: portData.itemId,
        fromOutput,
      });
    },
    [],
  );
  const clearForcedOnMachine = useDocumentStore((s) => s.clearForcedOnMachine);
  const clearForcedOnContainer = useDocumentStore((s) => s.clearForcedOnContainer);
  const setContainerOutputEnabled = useDocumentStore(
    (s) => s.setContainerOutputEnabled,
  );
  const setContainerVariant = useDocumentStore((s) => s.setContainerVariant);
  const addMachine = useDocumentStore((s) => s.addMachine);
  const addContainer = useDocumentStore((s) => s.addContainer);
  const removeMachine = useDocumentStore((s) => s.removeMachine);
  const removeContainer = useDocumentStore((s) => s.removeContainer);
  const addFactory = useWorldStore((s) => s.addFactory);
  const removeFactory = useWorldStore((s) => s.removeFactory);
  const duplicateFactory = useWorldStore((s) => s.duplicateFactory);
  const renameFactory = useWorldStore((s) => s.renameFactory);
  const navigateToCanvas = useWorldStore((s) => s.navigateToCanvas);
  const navigateWithTutorial = useCallback(
    async (canvasId: string) => {
      if (
        tutorialActive &&
        !tutorialGates.allowNavigateToCanvas(canvasId)
      ) {
        return;
      }
      await navigateToCanvas(canvasId);
      useTutorialStore.getState().onNavigatedTo(canvasId);
    },
    [navigateToCanvas, tutorialActive, tutorialGates],
  );
  const setActiveCanvasViewport = useWorldStore((s) => s.setActiveCanvasViewport);
  const activeCanvasId = useWorldStore((s) => s.activeCanvasId);
  const canvasMap = useWorldStore((s) => s.canvasMap);
  const setMachineRecipe = useDocumentStore((s) => s.setMachineRecipe);
  const setMachineClockPercent = useDocumentStore(
    (s) => s.setMachineClockPercent,
  );
  const solverReady = useDocumentStore((s) => s.solverReady);
  const setSolverReady = useDocumentStore((s) => s.setSolverReady);

  const [edgeMenu, setEdgeMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
  } | null>(null);

  const [machineMenu, setMachineMenu] = useState<{
    x: number;
    y: number;
    machineId: string;
    label: string;
  } | null>(null);

  const machineMenuClock = useMemo(() => {
    if (!machineMenu) return CLOCK_DEFAULT;
    const fr = nodes.find(
      (n) => n.id === machineMenu.machineId && n.type === "machineFrame",
    );
    return clampClockPercent(
      (fr?.data as MachineFrameData | undefined)?.clockPercent,
    );
  }, [machineMenu, nodes]);

  const [recipePicker, setRecipePicker] = useState<RecipePickerState | null>(
    null,
  );

  const [factoryMenu, setFactoryMenu] = useState<{
    x: number;
    y: number;
    factoryId: string;
    label: string;
  } | null>(null);

  const [containerMenu, setContainerMenu] = useState<{
    x: number;
    y: number;
    containerId: string;
    label: string;
  } | null>(null);

  const [factoryDeleteTarget, setFactoryDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const containerMenuData = useMemo(() => {
    if (!containerMenu) return null;
    const fr = nodes.find(
      (n) => n.id === containerMenu.containerId && n.type === "containerFrame",
    );
    if (!fr) return null;
    const d = fr.data as ContainerFrameData;
    return {
      variant: d.variant ?? "standard",
      outputEnabled: d.outputEnabled !== false,
    };
  }, [containerMenu, nodes]);

  const onViewportMoveEnd = useCallback(
    (_ev: unknown, viewport: { x: number; y: number; zoom: number }) => {
      setActiveCanvasViewport(viewport);
    },
    [setActiveCanvasViewport],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.length > 0) applyEdgesChange(changes);
    },
    [applyEdgesChange],
  );

  const onNodesChangeHandler = useCallback(
    (changes: NodeChange[]) => {
      const machineIds = new Set<string>();
      const factoryIds = new Set<string>();
      const forwarded: NodeChange[] = [];

      for (const change of changes) {
        if (change.type === "remove") {
          const n = useDocumentStore
            .getState()
            .nodes.find((node) => node.id === change.id);
          if (n?.type === "machineFrame") {
            machineIds.add(n.id);
            continue;
          }
          if (n?.type === "factoryFrame") {
            factoryIds.add(n.id);
            continue;
          }
          if (n?.type === "containerFrame") {
            machineIds.add(n.id);
            continue;
          }
          if (n?.type === "itemPort" && n.parentId) {
            const parent = useDocumentStore
              .getState()
              .nodes.find((p) => p.id === n.parentId);
            if (parent?.type === "containerFrame") {
              machineIds.add(n.parentId);
            } else {
              machineIds.add(n.parentId);
            }
            continue;
          }
        }
        forwarded.push(change);
      }

      if (factoryIds.size > 0) {
        for (const id of factoryIds) {
          if (tutorialActive && !tutorialGates.allowDeleteFactory(id)) continue;
          const node = useDocumentStore
            .getState()
            .nodes.find((n) => n.id === id);
          const label =
            (node?.data as FactoryFrameData | undefined)?.label ?? id;
          setFactoryDeleteTarget({ id, label });
        }
      }
      if (machineIds.size > 0) {
        for (const id of machineIds) {
          if (tutorialActive && !tutorialGates.allowDeleteMachine(id)) continue;
          const node = useDocumentStore.getState().nodes.find((n) => n.id === id);
          if (node?.type === "containerFrame") removeContainer(id);
          else {
            removeMachine(id);
            useTutorialStore.getState().onMachineRemoved(id);
          }
        }
        setMachineMenu(null);
        setContainerMenu(null);
        setRecipePicker(null);
        setEdgeMenu(null);
      }
      if (forwarded.length > 0) onNodesChange(forwarded);
    },
    [
      onNodesChange,
      removeMachine,
      removeContainer,
      tutorialActive,
      tutorialGates,
    ],
  );

  const isValidConnection = useCallback((edgeOrConn: Connection | Edge) => {
    const { nodes: list, edges } = useDocumentStore.getState();
    const src = list.find((n) => n.id === edgeOrConn.source);
    const tgt = list.find((n) => n.id === edgeOrConn.target);
    if (!src || !tgt || src.type !== "itemPort" || tgt.type !== "itemPort") {
      return false;
    }
    const sd = src.data as ItemPortData;
    const td = tgt.data as ItemPortData;
    if (sd.kind !== "out" || td.kind !== "in") return false;
    if (!portItemsCompatible(sd.itemId, td.itemId)) return false;
    const itemId = isPortItemAssigned(sd.itemId) ? sd.itemId : td.itemId;
    if (!isPortItemAssigned(itemId)) return false;
    const srcParent = list.find((n) => n.id === src.parentId);
    if (
      srcParent?.type === "containerFrame" &&
      sd.kind === "out" &&
      (srcParent.data as ContainerFrameData).outputEnabled === false
    ) {
      return false;
    }
    if (
      edgeOrConn.source &&
      edgeOrConn.target &&
      hasEdgeBetweenPorts(edges, edgeOrConn.source, edgeOrConn.target)
    ) {
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    const worker = createSolverWorker();
    pingSolver(worker)
      .then(() => setSolverReady(true))
      .catch(() => setSolverReady(false));
    return () => worker.terminate();
  }, [setSolverReady]);

  useEffect(() => {
    const inst = rfRef.current;
    if (!inst) return;
    const vp = canvasMap[activeCanvasId]?.viewport;
    if (vp) {
      inst.setViewport(vp);
    } else {
      inst.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [activeCanvasId]);

  const topology = useMemo(() => topologyEdgesFromFlow(edges), [edges]);

  const onRouteDrag = useCallback(
    (segmentId: string, snapshot: RouteGraph, pointer: Point, snap?: DragSnapOpts) => {
      setRouteGraph(dragSegment(snapshot, segmentId, pointer, snap));
    },
    [setRouteGraph],
  );

  const onRouteDragEnd = useCallback(
    (segmentId: string) => {
      const g = useDocumentStore.getState().routeGraph;
      const seg = g.segments.find((s) => s.id === segmentId);
      setRouteGraph(sanitizeRouteGraph(g, seg ? [seg.netId] : undefined));
    },
    [setRouteGraph],
  );

  const onRouteKink = useCallback(
    (segmentId: string, snapshot: RouteGraph, click: Point, pointer: Point, snap?: DragSnapOpts) => {
      setRouteGraph(kinkSegment(snapshot, segmentId, click, pointer, snap));
    },
    [setRouteGraph],
  );

  const onRouteDelete = useCallback(
    (segmentId: string) => {
      deleteRouteSegment(segmentId);
      setSelectedSegmentIds((ids) => ids.filter((id) => id !== segmentId));
    },
    [deleteRouteSegment],
  );

  const onSegmentContextMenu = useCallback(
    (segmentId: string, clientX: number, clientY: number) => {
      if (tutorialActive && !tutorialGates.allowEdgeContextMenu) return;
      const users =
        segmentEdgeUsers(
          useDocumentStore.getState().routeGraph,
          topologyEdgesFromFlow(useDocumentStore.getState().edges),
        ).get(segmentId) ?? [];
      const edgeId = users[0];
      if (!edgeId) return;
      setMachineMenu(null);
      setRecipePicker(null);
      setEdgeMenu({ x: clientX, y: clientY, edgeId });
    },
    [tutorialActive, tutorialGates],
  );

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full overflow-hidden"
      onContextMenu={(e) =>
        handleSuppressNativeContextMenu(e, canvasRef.current)
      }
    >
      <CanvasTransitionOverlay />
      <ReactFlow
        {...flowInteraction}
        onInit={(inst) => {
          rfRef.current = inst;
        }}
        onMoveEnd={onViewportMoveEnd}
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        isValidConnection={isValidConnection}
        onEdgeContextMenu={(event, edge) => {
          if (tutorialActive && !tutorialGates.allowEdgeContextMenu) return;
          event.preventDefault();
          setMachineMenu(null);
          setRecipePicker(null);
          setEdgeMenu({
            x: event.clientX,
            y: event.clientY,
            edgeId: edge.id,
          });
        }}
        nodeDragThreshold={6}
        elevateNodesOnSelect
        multiSelectionKeyCode="Shift"
        onNodeClick={(event, node) => {
          if (isPortForceInputTarget(event.target)) return;
          setSelectedSegmentIds([]);
          if (
            node.type === "machineFrame" ||
            node.type === "factoryFrame" ||
            node.type === "containerFrame"
          ) {
            applyMachineSelection(
              node.id,
              event.shiftKey ? "toggle" : "replace",
            );
            setMachineMenu(null);
            setFactoryMenu(null);
            setContainerMenu(null);
            setEdgeMenu(null);
            return;
          }
          if (node.type === "itemPort" && node.parentId) {
            applyMachineSelection(
              node.parentId,
              event.shiftKey ? "toggle" : "replace",
            );
            setMachineMenu(null);
            setFactoryMenu(null);
            setContainerMenu(null);
            setEdgeMenu(null);
          }
        }}
        onNodeDoubleClick={(_event, node) => {
          if (node.type === "factoryFrame") {
            if (
              tutorialActive &&
              (!tutorialGates.allowFactoryDoubleClick ||
                !tutorialGates.allowFactoryOpen ||
                !tutorialGates.allowNavigateToCanvas(node.id))
            ) {
              return;
            }
            void navigateWithTutorial(node.id);
          }
        }}
        nodesConnectable={
          !tutorialActive ||
          tutorialGates.allowPortLinkDrag ||
          tutorialGates.allowFreeConnect
        }
        nodesDraggable={!tutorialActive || tutorialGates.allowNodeDrag}
        onNodeDragStart={(event, node) => {
          setSelectedSegmentIds([]);
          if (
            node.type === "machineFrame" ||
            node.type === "factoryFrame" ||
            node.type === "containerFrame"
          ) {
            machineDrag.current = {
              snapshot: cloneRouteGraph(
                useDocumentStore.getState().routeGraph,
              ),
            };
          }
          if (
            (node.type !== "machineFrame" &&
              node.type !== "factoryFrame" &&
              node.type !== "containerFrame") ||
            node.selected
          ) {
            return;
          }
          applyMachineSelection(
            node.id,
            event.shiftKey ? "add" : "replace",
          );
        }}
        onNodeDrag={(_event, node) => {
          const st = machineDrag.current;
          if (!st) return;
          if (
            node.type !== "machineFrame" &&
            node.type !== "factoryFrame" &&
            node.type !== "containerFrame"
          ) {
            return;
          }
          const ports = portHandlesFromNodes(
            useDocumentStore.getState().nodes,
          );
          setRouteGraph(followPortVertices(st.snapshot, ports));
        }}
        onNodeDragStop={(_event, node) => {
          machineDrag.current = null;
          const st = useDocumentStore.getState();
          const ports = portHandlesFromNodes(st.nodes);
          const live = followPortVertices(st.routeGraph, ports);
          const machineIds = new Set<string>();
          if (
            node.type === "machineFrame" ||
            node.type === "factoryFrame" ||
            node.type === "containerFrame"
          ) {
            machineIds.add(node.id);
          }
          for (const n of st.nodes) {
            if (
              n.selected &&
              (n.type === "machineFrame" ||
                n.type === "factoryFrame" ||
                n.type === "containerFrame")
            ) {
              machineIds.add(n.id);
            }
          }
          const portIds = ports
            .filter((p) => p.parentId && machineIds.has(p.parentId))
            .map((p) => p.portId);
          setRouteGraph(
            sanitizeRouteGraph(live, netIdsTouchingPorts(live, portIds)),
          );
        }}
        onNodeContextMenu={(event, node) => {
          if (node.type === "itemPort") {
            if (tutorialActive && !tutorialGates.allowPortRecipePicker) return;
            if (
              tutorialActive &&
              tutorialGates.requiredLinkOriginPortId &&
              node.id !== tutorialGates.requiredLinkOriginPortId
            ) {
              return;
            }
            event.preventDefault();
            setEdgeMenu(null);
            setMachineMenu(null);
            const d = node.data as ItemPortData;
            const flow =
              rfRef.current?.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              }) ?? { x: 0, y: 0 };
            if (d.kind === "out") {
              setRecipePicker({
                anchor: { x: event.clientX, y: event.clientY },
                flowPosition: flow,
                filter: { mode: "consumes", itemId: d.itemId },
                subtitle: t("fromOutputConsumes", {
                  item: itemPortDisplayName(d.itemId, d.displayName),
                }),
                linkOriginPortId: node.id,
              });
            } else {
              setRecipePicker({
                anchor: { x: event.clientX, y: event.clientY },
                flowPosition: flow,
                filter: { mode: "produces", itemId: d.itemId },
                subtitle: t("fromInputProduces", {
                  item: itemPortDisplayName(d.itemId, d.displayName),
                }),
                linkOriginPortId: node.id,
              });
            }
            return;
          }
          if (node.type === "machineFrame") {
            if (tutorialActive && !tutorialGates.allowMachineContextMenu) return;
            event.preventDefault();
            setEdgeMenu(null);
            setRecipePicker(null);
            setFactoryMenu(null);
            setContainerMenu(null);
            const label =
              (node.data as { label?: string }).label ?? node.id;
            setMachineMenu({
              x: event.clientX,
              y: event.clientY,
              machineId: node.id,
              label,
            });
            return;
          }
          if (node.type === "factoryFrame") {
            if (
              tutorialActive &&
              (!tutorialGates.allowFactoryContextMenu ||
                !tutorialGates.allowFactoryContextMenuFor(node.id))
            ) {
              return;
            }
            event.preventDefault();
            setEdgeMenu(null);
            setRecipePicker(null);
            setMachineMenu(null);
            setContainerMenu(null);
            const label =
              (node.data as FactoryFrameData).label ?? node.id;
            setFactoryMenu({
              x: event.clientX,
              y: event.clientY,
              factoryId: node.id,
              label,
            });
            return;
          }
          if (node.type === "containerFrame") {
            if (tutorialActive) return;
            event.preventDefault();
            setEdgeMenu(null);
            setRecipePicker(null);
            setMachineMenu(null);
            setFactoryMenu(null);
            const label =
              (node.data as ContainerFrameData).label ?? node.id;
            setContainerMenu({
              x: event.clientX,
              y: event.clientY,
              containerId: node.id,
              label,
            });
          }
        }}
        onPaneClick={() => {
          clearMachineSelection();
          setSelectedSegmentIds([]);
          setConnectionPreview(null);
          setEdgeMenu(null);
          setMachineMenu(null);
          setFactoryMenu(null);
          setContainerMenu(null);
          setRecipePicker(null);
        }}
        onPaneContextMenu={(e) => {
          if (tutorialActive && !tutorialGates.allowPaneRecipePicker) return;
          e.preventDefault();
          setEdgeMenu(null);
          setMachineMenu(null);
          const flow =
            rfRef.current?.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            }) ?? { x: 0, y: 0 };
          setRecipePicker({
            anchor: { x: e.clientX, y: e.clientY },
            flowPosition: flow,
            filter: { mode: "none" },
            subtitle: t("newMachineAllRecipes"),
          });
        }}
        onConnectEnd={(event, cs) => {
          setConnectionPreview(null);
          if (tutorialActive && !tutorialGates.allowPortLinkDrag) return;
          const fromId = cs.fromNode?.id ?? cs.fromHandle?.nodeId;
          if (!fromId) return;
          if (cs.toHandle !== null) return;
          if (
            tutorialGates.requiredLinkOriginPortId &&
            fromId !== tutorialGates.requiredLinkOriginPortId
          ) {
            return;
          }
          const n = rfRef.current?.getNode(fromId);
          if (!n || n.type !== "itemPort") return;
          const d = n.data as ItemPortData;
          const { x: cx, y: cy } = clientXY(event);
          const flow =
            rfRef.current?.screenToFlowPosition({
              x: cx,
              y: cy,
            }) ?? { x: 0, y: 0 };
          if (d.kind === "out") {
            scheduleRecipePickerOpen(setRecipePicker, {
              anchor: { x: cx, y: cy },
              flowPosition: flow,
              filter: { mode: "consumes", itemId: d.itemId },
              subtitle: t("connectFromOutputConsumes", {
                item: itemPortDisplayName(d.itemId, d.displayName),
              }),
              linkOriginPortId: fromId,
            });
          } else {
            scheduleRecipePickerOpen(setRecipePicker, {
              anchor: { x: cx, y: cy },
              flowPosition: flow,
              filter: { mode: "produces", itemId: d.itemId },
              subtitle: t("connectFromInputProduces", {
                item: itemPortDisplayName(d.itemId, d.displayName),
              }),
              linkOriginPortId: fromId,
            });
          }
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid={machineGridSnap}
        snapGrid={[MACHINE_SNAP_GRID, MACHINE_SNAP_GRID]}
        className="bg-[var(--bg)]"
        proOptions={{ hideAttribution: true }}
        elevateEdgesOnSelect
        defaultEdgeOptions={{
          interactionWidth: 0,
          animated: false,
        }}
      >
        <Background gap={BACKGROUND_GRID_GAP} color="var(--flow-grid)" />
        <Controls className="!bg-[var(--surface)] !border-[var(--border)] !shadow-lg" />
        <MiniMap
          className="!bg-[var(--surface)] !border-[var(--border)]"
          maskColor="var(--minimap-mask)"
        />
        <Panel position="top-right">
          <div className="flex flex-col items-end gap-1 text-right">
            {solve.hardConflict ? (
              <div
                className="max-w-xs rounded border px-2 py-1.5 text-[11px] leading-snug"
                style={{
                  borderColor: "var(--conflict-border)",
                  backgroundColor: "var(--conflict-bg)",
                  color: "var(--conflict-text)",
                }}
              >
                {solve.errorMessage ?? t("solverConflict")}
              </div>
            ) : solverReady ? (
              <span className="text-xs text-emerald-400/90">
                {t("solverReady")}
              </span>
            ) : (
              <span className="text-xs text-amber-400/90">
                {t("solverPending")}
              </span>
            )}
          </div>
        </Panel>
        <EdgeMenuHost
          menu={edgeMenu}
          edges={edges}
          onDismiss={() => setEdgeMenu(null)}
        />
        <RouteOverlay
          graph={routeGraph}
          selectedSegmentIds={selectedSegmentIds}
          topology={topology}
          conflictEdgeIds={solve.conflictEdgeIds}
          onSelect={(id, opts) => {
            setSelectedSegmentIds((cur) =>
              nextSegmentSelection(
                cur,
                id,
                useDocumentStore.getState().routeGraph.segments,
                opts?.toggle,
              ),
            );
          }}
          onDrag={onRouteDrag}
          onKink={onRouteKink}
          onDragEnd={onRouteDragEnd}
          onDelete={onRouteDelete}
          onSegmentContextMenu={onSegmentContextMenu}
        />
      </ReactFlow>
      {machineMenu
        ? createPortal(
            <MachineContextMenu
              x={machineMenu.x}
              y={machineMenu.y}
              machineLabel={machineMenu.label}
              clockPercent={machineMenuClock}
              onClockPercentChange={(v) =>
                setMachineClockPercent(machineMenu.machineId, v)
              }
              onClose={() => setMachineMenu(null)}
              onClearForced={() => clearForcedOnMachine(machineMenu.machineId)}
              onChangeRecipe={() => {
                setMachineMenu(null);
                const flow =
                  rfRef.current?.screenToFlowPosition({
                    x: machineMenu.x,
                    y: machineMenu.y,
                  }) ?? { x: 0, y: 0 };
                setRecipePicker({
                  anchor: { x: machineMenu.x, y: machineMenu.y },
                  flowPosition: flow,
                  filter: { mode: "none" },
                  replaceMachineId: machineMenu.machineId,
                  subtitle: t("changeRecipeInvalid"),
                });
              }}
              onDeleteMachine={() => {
                const mid = machineMenu.machineId;
                if (tutorialActive && !tutorialGates.allowDeleteMachine(mid)) {
                  return;
                }
                removeMachine(mid);
                useTutorialStore.getState().onMachineRemoved(mid);
                setMachineMenu(null);
              }}
            />,
            document.body,
          )
        : null}
      {recipePicker ? (
        <MachineRecipePicker
          anchorScreen={recipePicker.anchor}
          recipeFilter={recipePicker.filter}
          subtitle={recipePicker.subtitle}
          disableMiscFactory={Boolean(recipePicker.linkOriginPortId)}
          tutorialConstraint={tutorialGates.pickerConstraint}
          lockDismiss={tutorialActive}
          onClose={() => setRecipePicker(null)}
          onPickFactory={() => {
            const id = addFactory(recipePicker.flowPosition);
            if (id) useTutorialStore.getState().onFactoryAdded(id);
            if (!id) alert(t("factoryDepthLimit"));
            setRecipePicker(null);
          }}
          onPickContainer={(variant) => {
            addContainer(
              variant,
              recipePicker.flowPosition,
              recipePicker.linkOriginPortId
                ? { linkOriginPortId: recipePicker.linkOriginPortId }
                : undefined,
            );
            setRecipePicker(null);
          }}
          onPick={(recipeKey) => {
            const linkId = recipePicker.linkOriginPortId;
            if (recipePicker.replaceMachineId) {
              setMachineRecipe(recipePicker.replaceMachineId, recipeKey);
            } else {
              const beforeIds = new Set(
                useDocumentStore.getState().nodes.map((n) => n.id),
              );
              addMachine(
                recipeKey,
                recipePicker.flowPosition,
                linkId ? { linkOriginPortId: linkId } : undefined,
              );
              const added = useDocumentStore
                .getState()
                .nodes.find(
                  (n) =>
                    n.type === "machineFrame" && !beforeIds.has(n.id),
                );
              if (added) {
                useTutorialStore
                  .getState()
                  .onMachineAdded(recipeKey, added.id, linkId);
              }
            }
            setRecipePicker(null);
          }}
        />
      ) : null}
      {factoryMenu
        ? createPortal(
            <FactoryContextMenu
              x={factoryMenu.x}
              y={factoryMenu.y}
              label={factoryMenu.label}
              onClose={() => setFactoryMenu(null)}
              onOpen={() => {
                if (tutorialActive && !tutorialGates.allowFactoryOpen) return;
                void navigateWithTutorial(factoryMenu.factoryId);
                setFactoryMenu(null);
              }}
              onRename={() => {
                const next = window.prompt(t("factoryRenameMenu"), factoryMenu.label);
                if (next) {
                  renameFactory(factoryMenu.factoryId, next);
                  useTutorialStore
                    .getState()
                    .onFactoryRenamed(factoryMenu.factoryId, next);
                }
                setFactoryMenu(null);
              }}
              onDuplicate={() => {
                duplicateFactory(factoryMenu.factoryId);
                setFactoryMenu(null);
              }}
              onDelete={() => {
                const fid = factoryMenu.factoryId;
                if (tutorialActive && !tutorialGates.allowDeleteFactory(fid)) {
                  setFactoryMenu(null);
                  return;
                }
                setFactoryDeleteTarget({
                  id: fid,
                  label: factoryMenu.label,
                });
                setFactoryMenu(null);
              }}
            />,
            document.body,
          )
        : null}
      {containerMenu && containerMenuData
        ? createPortal(
            <ContainerContextMenu
              x={containerMenu.x}
              y={containerMenu.y}
              containerLabel={containerMenu.label}
              variant={containerMenuData.variant}
              outputEnabled={containerMenuData.outputEnabled}
              onOutputEnabledChange={(v) =>
                setContainerOutputEnabled(containerMenu.containerId, v)
              }
              onVariantChange={(v) =>
                setContainerVariant(containerMenu.containerId, v)
              }
              onClose={() => setContainerMenu(null)}
              onClearForced={() =>
                clearForcedOnContainer(containerMenu.containerId)
              }
              onDeleteContainer={() => {
                removeContainer(containerMenu.containerId);
                setContainerMenu(null);
              }}
            />,
            document.body,
          )
        : null}
      <DestructiveConfirmDialog
        open={factoryDeleteTarget !== null}
        title={
          factoryDeleteTarget
            ? t("factoryDeleteTitle", { name: factoryDeleteTarget.label })
            : ""
        }
        body={t("factoryDeleteBody")}
        onCancel={() => setFactoryDeleteTarget(null)}
        onConfirm={() => {
          if (factoryDeleteTarget) {
            const fid = factoryDeleteTarget.id;
            removeFactory(fid);
            useTutorialStore.getState().onFactoryRemoved(fid);
          }
          setFactoryDeleteTarget(null);
        }}
      />
    </div>
  );
}

export function FlowCanvas() {
  return <FlowCanvasInner />;
}
