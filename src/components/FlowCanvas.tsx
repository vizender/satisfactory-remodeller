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
import { EdgeContextMenu } from "@/components/EdgeContextMenu";
import { WideHitBezierEdge } from "@/components/edges/WideHitBezierEdge";
import { ItemPortNode } from "@/components/ItemPortNode";
import { MachineContextMenu } from "@/components/MachineContextMenu";
import { MachineRecipePicker } from "@/components/MachineRecipePicker";
import { MachineFrameNode } from "@/components/MachineFrameNode";
import { useFlowSolveResult } from "@/hooks/useFlowSolve";
import {
  reactFlowInteractionProps,
  useInputModality,
} from "@/hooks/useInputModality";
import { useSuppressNativeContextMenu } from "@/hooks/useSuppressNativeContextMenu";
import type { RecipeFilter } from "@/lib/recipeFilters";
import {
  applyConnectionPreviewToNodes,
  applyReorderTransitionToNodes,
  type ConnectionDragPreview,
} from "@/lib/nodeDisplayDecorators";
import { createSolverWorker, pingSolver } from "@/lib/solverClient";
import { CLOCK_DEFAULT, clampClockPercent } from "@/lib/clockSpeed";
import {
  hasEdgeBetweenPorts,
  useDocumentStore,
} from "@/store/useDocumentStore";
import type { ItemPortData, MachineFrameData } from "@/types/graph";

const nodeTypes: NodeTypes = {
  machineFrame: MachineFrameNode,
  itemPort: ItemPortNode,
};

const edgeTypes: EdgeTypes = {
  /** Remplace le Bezier par défaut : hitbox large compatible WebKit / clic droit (voir composant). */
  default: WideHitBezierEdge,
};

function clientXY(ev: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("clientX" in ev) return { x: ev.clientX, y: ev.clientY };
  const t = ev.changedTouches?.[0];
  return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
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
  menu: { x: number; y: number; edgeId: string } | null;
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
  const { effective: inputModality } = useInputModality();
  const flowInteraction = reactFlowInteractionProps(inputModality);
  const canvasRef = useRef<HTMLDivElement>(null);
  useSuppressNativeContextMenu(canvasRef);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const nodes = useDocumentStore((s) => s.nodes);
  const reorderDragSession = useDocumentStore((s) => s.reorderDragSession);
  const edges = useDocumentStore((s) => s.edges);
  const onNodesChange = useDocumentStore((s) => s.onNodesChange);
  const applyEdgesChange = useDocumentStore((s) => s.onEdgesChange);
  const storeOnConnect = useDocumentStore((s) => s.onConnect);

  const [connectionPreview, setConnectionPreview] =
    useState<ConnectionDragPreview | null>(null);

  const displayNodes = useMemo(() => {
    let next = nodes;
    next = applyConnectionPreviewToNodes(next, connectionPreview);
    next = applyReorderTransitionToNodes(next, reorderDragSession);
    return next;
  }, [nodes, connectionPreview, reorderDragSession]);

  const onConnect = useCallback(
    (c: Connection) => {
      storeOnConnect(c);
      setConnectionPreview(null);
    },
    [storeOnConnect],
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
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
  const addMachine = useDocumentStore((s) => s.addMachine);
  const removeMachine = useDocumentStore((s) => s.removeMachine);
  const setMachineRecipe = useDocumentStore((s) => s.setMachineRecipe);
  const setMachineClockPercent = useDocumentStore(
    (s) => s.setMachineClockPercent,
  );
  const solverReady = useDocumentStore((s) => s.solverReady);
  const setSolverReady = useDocumentStore((s) => s.setSolverReady);

  const solve = useFlowSolveResult();

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

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.length > 0) applyEdgesChange(changes);
    },
    [applyEdgesChange],
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
    if (sd.itemId !== td.itemId) return false;
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

  return (
    <div ref={canvasRef} className="h-full w-full">
      <ReactFlow
        {...flowInteraction}
        onInit={(inst) => {
          rfRef.current = inst;
        }}
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        isValidConnection={isValidConnection}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          event.stopPropagation();
          setMachineMenu(null);
          setRecipePicker(null);
          setEdgeMenu({
            x: event.clientX,
            y: event.clientY,
            edgeId: edge.id,
          });
        }}
        onNodeContextMenu={(event, node) => {
          if (node.type === "itemPort") {
            event.preventDefault();
            event.stopPropagation();
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
                subtitle: `Lien depuis une sortie — recettes qui consomment « ${d.displayName} »`,
                linkOriginPortId: node.id,
              });
            } else {
              setRecipePicker({
                anchor: { x: event.clientX, y: event.clientY },
                flowPosition: flow,
                filter: { mode: "produces", itemId: d.itemId },
                subtitle: `Lien depuis une entrée — recettes qui produisent « ${d.displayName} »`,
                linkOriginPortId: node.id,
              });
            }
            return;
          }
          if (node.type === "machineFrame") {
            event.preventDefault();
            event.stopPropagation();
            setEdgeMenu(null);
            setRecipePicker(null);
            const label =
              (node.data as { label?: string }).label ?? node.id;
            setMachineMenu({
              x: event.clientX,
              y: event.clientY,
              machineId: node.id,
              label,
            });
          }
        }}
        onPaneClick={() => {
          setConnectionPreview(null);
          setEdgeMenu(null);
          setMachineMenu(null);
          setRecipePicker(null);
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
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
            subtitle: "Nouvelle machine — toutes les recettes",
          });
        }}
        onConnectEnd={(event, cs) => {
          setConnectionPreview(null);
          const fromId = cs.fromNode?.id ?? cs.fromHandle?.nodeId;
          if (!fromId) return;
          if (cs.toHandle !== null) return;
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
              subtitle: `Connexion depuis une sortie — recettes qui consomment « ${d.displayName} »`,
              linkOriginPortId: fromId,
            });
          } else {
            scheduleRecipePickerOpen(setRecipePicker, {
              anchor: { x: cx, y: cy },
              flowPosition: flow,
              filter: { mode: "produces", itemId: d.itemId },
              subtitle: `Connexion depuis une entrée — recettes qui produisent « ${d.displayName} »`,
              linkOriginPortId: fromId,
            });
          }
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid
        snapGrid={[16, 16]}
        className="bg-[var(--bg)]"
        proOptions={{ hideAttribution: true }}
        nodesConnectable
        elevateEdgesOnSelect
        defaultEdgeOptions={{
          /**
           * Valeur côté XYFlow (unités graphe). La vraie hitbox confortable est surtout le CSS
           * `non-scaling-stroke` sur `.react-flow__edge-interaction` dans `index.css`.
           */
          interactionWidth: 100,
          /** `animated: true` en XYFlow dessine un trait en pointillés (flux animé), confondu avec des liens « suggérés ». */
          animated: false,
        }}
      >
        <Background gap={16} color="#2d3a4d" />
        <Controls className="!bg-[var(--surface)] !border-[var(--border)] !shadow-lg" />
        <MiniMap
          className="!bg-[var(--surface)] !border-[var(--border)]"
          maskColor="rgba(15,20,25,0.85)"
        />
        <Panel position="top-right">
          <div className="flex flex-col items-end gap-1 text-right">
            <span
              className={
                solverReady
                  ? "text-xs text-emerald-400/90"
                  : "text-xs text-amber-400/90"
              }
            >
              {solverReady ? "Worker solveur OK" : "Worker solveur…"}
            </span>
            {solve.hardConflict ? (
              <div className="max-w-xs rounded border border-red-500/40 bg-red-950/40 px-2 py-1.5 text-[11px] leading-snug text-red-200">
                {solve.errorMessage ?? "Contraintes impossibles."}
              </div>
            ) : null}
          </div>
        </Panel>
        <EdgeMenuHost
          menu={edgeMenu}
          edges={edges}
          onDismiss={() => setEdgeMenu(null)}
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
                  subtitle: "Changer la recette — les liaisons invalides seront retirées",
                });
              }}
              onDeleteMachine={() => {
                removeMachine(machineMenu.machineId);
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
          onClose={() => setRecipePicker(null)}
          onPick={(recipeKey) => {
            if (recipePicker.replaceMachineId) {
              setMachineRecipe(recipePicker.replaceMachineId, recipeKey);
            } else {
              addMachine(
                recipeKey,
                recipePicker.flowPosition,
                recipePicker.linkOriginPortId
                  ? { linkOriginPortId: recipePicker.linkOriginPortId }
                  : undefined,
              );
            }
            setRecipePicker(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function FlowCanvas() {
  return <FlowCanvasInner />;
}
