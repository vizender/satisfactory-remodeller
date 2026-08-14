import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ItemPortNode } from "@/components/ItemPortNode";
import { MachineFrameNode } from "@/components/MachineFrameNode";
import { HiddenTopologyEdge } from "@/components/routing/HiddenTopologyEdge";
import { RouteOverlay } from "@/components/routing/RouteOverlay";
import { BACKGROUND_GRID_GAP, SNAP_GRID_SIZE } from "@/constants/flowGrid";
import { buildMachineNodes } from "@/lib/buildMachineGraph";
import {
  cloneRouteGraph,
  deleteSegment,
  dragSegment,
  followPortVertices,
  kinkSegment,
  netIdsTouchingPorts,
  nextSegmentSelection,
  portHandlesFromNodes,
  sanitizeRouteGraph,
  topologyEdgesFromFlow,
  type DragSnapOpts,
  type Point,
  type RouteGraph,
} from "@/lib/routing";
import { RECIPE_IRON_INGOT, RECIPE_IRON_PLATE } from "@/tutorial/constants";
import { useDocumentStore } from "@/store/useDocumentStore";
import { buildLabScene, LAB_SCENE_META, type LabSceneId } from "./scenes";
import { useRoutingLabStore } from "./store";

const nodeTypes: NodeTypes = {
  machineFrame: MachineFrameNode,
  itemPort: ItemPortNode,
};

const edgeTypes: EdgeTypes = {
  default: HiddenTopologyEdge,
};

function loadScene(id: LabSceneId) {
  const { nodes, edges } = buildLabScene(id);
  useDocumentStore.getState().replaceActiveCanvas({
    nodes,
    edges,
    forcedPortRates: {},
  });
  useRoutingLabStore.getState().setSceneId(id);
}

function LabCanvas() {
  const { fitView } = useReactFlow();
  const nodes = useDocumentStore((s) => s.nodes);
  const edges = useDocumentStore((s) => s.edges);
  const graph = useDocumentStore((s) => s.routeGraph);
  const setRouteGraph = useDocumentStore((s) => s.setRouteGraph);
  const onNodesChange = useDocumentStore((s) => s.onNodesChange);
  const storeOnConnect = useDocumentStore((s) => s.onConnect);
  const selected = useRoutingLabStore((s) => s.selectedSegmentIds);
  const debug = useRoutingLabStore((s) => s.debug);
  const sceneId = useRoutingLabStore((s) => s.sceneId);

  const machineDrag = useRef<{ snapshot: RouteGraph } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => fitView({ padding: 0.2 }), 40);
    return () => window.clearTimeout(t);
  }, [sceneId, fitView]);

  const onConnect = useCallback(
    (c: Connection) => {
      storeOnConnect(c);
    },
    [storeOnConnect],
  );

  const onNodesChangeHandler = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const onNodeDragStart = useCallback((_e: unknown, node: Node) => {
    if (node.type !== "machineFrame") return;
    machineDrag.current = {
      snapshot: cloneRouteGraph(useDocumentStore.getState().routeGraph),
    };
  }, []);

  const onNodeDrag = useCallback((_e: unknown, node: Node) => {
    const st = machineDrag.current;
    if (!st || node.type !== "machineFrame") return;
    const ports = portHandlesFromNodes(useDocumentStore.getState().nodes);
    setRouteGraph(followPortVertices(st.snapshot, ports));
  }, [setRouteGraph]);

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      machineDrag.current = null;
      const st = useDocumentStore.getState();
      const ports = portHandlesFromNodes(st.nodes);
      const live = followPortVertices(st.routeGraph, ports);
      const machineIds = new Set<string>([node.id]);
      for (const n of st.nodes) {
        if (n.selected && n.type === "machineFrame") machineIds.add(n.id);
      }
      const portIds = ports
        .filter((p) => p.parentId && machineIds.has(p.parentId))
        .map((p) => p.portId);
      setRouteGraph(
        sanitizeRouteGraph(live, netIdsTouchingPorts(live, portIds)),
      );
    },
    [setRouteGraph],
  );

  const topology = useMemo(() => topologyEdgesFromFlow(edges), [edges]);

  const onDrag = useCallback(
    (segmentId: string, snapshot: RouteGraph, pointer: Point, snap?: DragSnapOpts) => {
      setRouteGraph(dragSegment(snapshot, segmentId, pointer, snap));
    },
    [setRouteGraph],
  );

  const onDragEnd = useCallback(
    (segmentId: string) => {
      const g = useDocumentStore.getState().routeGraph;
      const seg = g.segments.find((s) => s.id === segmentId);
      setRouteGraph(sanitizeRouteGraph(g, seg ? [seg.netId] : undefined));
    },
    [setRouteGraph],
  );

  const onKink = useCallback(
    (segmentId: string, snapshot: RouteGraph, click: Point, pointer: Point, snap?: DragSnapOpts) => {
      setRouteGraph(kinkSegment(snapshot, segmentId, click, pointer, snap));
    },
    [setRouteGraph],
  );

  const onDelete = useCallback(
    (segmentId: string) => {
      const { graph: next, removedEdgeIds } = deleteSegment(
        useDocumentStore.getState().routeGraph,
        segmentId,
        topology,
      );
      setRouteGraph(next);
      useRoutingLabStore.getState().setSelectedSegmentIds(
        useRoutingLabStore
          .getState()
          .selectedSegmentIds.filter((id) => id !== segmentId),
      );
      if (removedEdgeIds.length) {
        const drop = new Set(removedEdgeIds);
        useDocumentStore.setState((s) => ({
          edges: s.edges.filter((e) => !drop.has(e.id)),
        }));
      }
    },
    [setRouteGraph, topology],
  );

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeHandler}
        onConnect={onConnect}
        onPaneClick={() =>
          useRoutingLabStore.getState().setSelectedSegmentIds([])
        }
        onNodeClick={() =>
          useRoutingLabStore.getState().setSelectedSegmentIds([])
        }
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid
        snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-[var(--bg)]"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ interactionWidth: 0 }}
      >
        <Background gap={BACKGROUND_GRID_GAP} color="var(--flow-grid)" />
        <RouteOverlay
          graph={graph}
          selectedSegmentIds={selected}
          debug={debug}
          topology={topology}
          onSelect={(id, opts) => {
            const cur = useRoutingLabStore.getState().selectedSegmentIds;
            useRoutingLabStore.getState().setSelectedSegmentIds(
              nextSegmentSelection(
                cur,
                id,
                useDocumentStore.getState().routeGraph.segments,
                opts?.toggle,
              ),
            );
          }}
          onDrag={onDrag}
          onKink={onKink}
          onDragEnd={onDragEnd}
          onDelete={onDelete}
        />
      </ReactFlow>
    </div>
  );
}

function addLabMachine(recipeKey: string) {
  const { nodes } = useDocumentStore.getState();
  const n = nodes.filter((x) => x.type === "machineFrame").length;
  const built = buildMachineNodes({
    id: `lab${Date.now().toString(36)}`,
    position: { x: 80 + n * 40, y: 80 + n * 40 },
    label: recipeKey === RECIPE_IRON_INGOT ? "Smelter" : "Constructor",
    recipeKey,
  });
  useDocumentStore.setState((s) => ({ nodes: [...s.nodes, ...built] }));
}

function Sidebar() {
  const sceneId = useRoutingLabStore((s) => s.sceneId);
  const debug = useRoutingLabStore((s) => s.debug);
  const graph = useDocumentStore((s) => s.routeGraph);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Routing lab
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
          Straight-line overlay. Reverse links wrap: min H stub off each port,
          then a U that clears the machines. Select a wire, drag the body, grab
          the midpoint to kink, Delete to cascade.
        </p>
      </div>
      {(["Simple", "Networks", "Stress"] as const).map((group) => (
        <div key={group}>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            {group}
          </div>
          <div className="flex flex-col gap-0.5">
            {LAB_SCENE_META.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => loadScene(s.id)}
                className={`rounded px-2 py-1 text-left text-[12px] ${
                  sceneId === s.id
                    ? "bg-[var(--accent)]/15 text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                }`}
              >
                {s.id}. {s.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="rounded border border-[var(--border)] px-2 py-1 text-[12px] hover:border-[var(--accent)]/40"
        onClick={() => loadScene(sceneId)}
      >
        Reset scene
      </button>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={debug}
          onChange={() => useRoutingLabStore.getState().toggleDebug()}
        />
        Debug vertices
      </label>
      {sceneId === 11 ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="rounded border border-[var(--border)] px-2 py-1 text-[12px]"
            onClick={() => addLabMachine(RECIPE_IRON_INGOT)}
          >
            Add smelter
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-2 py-1 text-[12px]"
            onClick={() => addLabMachine(RECIPE_IRON_PLATE)}
          >
            Add constructor
          </button>
        </div>
      ) : null}
      <div className="mt-auto text-[10px] text-[var(--muted)]">
        {graph.nets.length} net{graph.nets.length === 1 ? "" : "s"} ·{" "}
        {graph.segments.length} segs · {graph.vertices.length} verts
      </div>
    </aside>
  );
}

export function RoutingLabApp() {
  useEffect(() => {
    loadScene(1);
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar />
      <ReactFlowProvider>
        <LabCanvas />
      </ReactFlowProvider>
    </div>
  );
}
