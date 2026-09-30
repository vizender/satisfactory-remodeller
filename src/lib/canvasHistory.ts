import type { Edge, Node } from "@xyflow/react";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useWorldStore } from "@/store/useWorldStore";
import { emptyRouteGraph } from "@/lib/routing";
import type { CanvasRecord } from "@/types/canvas";

type Snapshot = {
  canvases: Record<string, CanvasRecord>;
  activeCanvasId: string;
  factoryNameCounter: number;
};

function cleanNode(node: Node): Node {
  const { selected, dragging, measured, resizing, width, height, ...saved } =
    node;
  return saved;
}
function cleanEdge(edge: Edge): Edge {
  const { selected, ...saved } = edge;
  return saved;
}

/** Capture both stores atomically after an edit settles. UI-only changes aren't edits. */
function capture(): Snapshot {
  const world = useWorldStore.getState();
  const doc = useDocumentStore.getState();
  const canvases = { ...world.canvasMap };
  const active = canvases[world.activeCanvasId];
  if (active)
    canvases[active.id] = {
      ...active,
      nodes: doc.nodes,
      edges: doc.edges,
      forcedPortRates: doc.forcedPortRates,
      routeGraph: doc.routeGraph,
    };
  return structuredClone({
    activeCanvasId: world.activeCanvasId,
    factoryNameCounter: world.factoryNameCounter,
    canvases: Object.fromEntries(
      Object.entries(canvases).map(([id, canvas]) => {
        const { viewport, ...saved } = canvas;
        return [
          id,
          {
            ...saved,
            nodes: canvas.nodes.map(cleanNode),
            edges: canvas.edges.map(cleanEdge),
            routeGraph: canvas.routeGraph ?? emptyRouteGraph(),
          },
        ];
      }),
    ),
  });
}
const contentKey = (snapshot: Snapshot) =>
  JSON.stringify([snapshot.canvases, snapshot.factoryNameCounter]);

/** Session-only document history. One pointer gesture or synchronous edit = one entry. */
export function createCanvasHistory(limit = 100) {
  let present = capture();
  let key = contentKey(present);
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  let restoring = false;
  let disposed = false;
  let queued = false;
  let gesture = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (disposed || restoring || gesture) return;
    const next = capture();
    const nextKey = contentKey(next);
    if (nextKey !== key) {
      past.push(present);
      if (past.length > limit) past.shift();
      future.length = 0;
    }
    present = next;
    key = nextKey;
  };
  const schedule = () => {
    if (disposed || restoring || gesture || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      flush();
    });
  };
  const unsubscribeDoc = useDocumentStore.subscribe(schedule);
  const unsubscribeWorld = useWorldStore.subscribe(schedule);

  const restore = (snapshot: Snapshot) => {
    restoring = true;
    try {
      const current = useWorldStore.getState();
      const canvases = structuredClone(snapshot.canvases);
      // Keep viewports out of history: zooming/panning should never consume Undo.
      for (const [id, canvas] of Object.entries(canvases))
        canvas.viewport = current.canvasMap[id]?.viewport;
      const activeCanvasId = canvases[snapshot.activeCanvasId]
        ? snapshot.activeCanvasId
        : "world";
      useWorldStore.setState({
        canvasMap: canvases,
        activeCanvasId,
        factoryNameCounter: snapshot.factoryNameCounter,
        isNavigating: false,
        navigationTargetId: null,
      });
      const canvas = canvases[activeCanvasId];
      useDocumentStore.setState({
        nodes: canvas.nodes,
        edges: canvas.edges,
        forcedPortRates: canvas.forcedPortRates,
        routeGraph: canvas.routeGraph ?? emptyRouteGraph(),
        reorderDragSession: null,
      });
      present = capture();
      key = contentKey(present);
    } finally {
      restoring = false;
    }
  };

  return {
    flush,
    beginGesture() {
      if (endTimer !== undefined) {
        clearTimeout(endTimer);
        endTimer = undefined;
        gesture = false;
      }
      flush();
      gesture = true;
    },
    endGesture() {
      if (endTimer !== undefined) clearTimeout(endTimer);
      // Pointer-up is followed by mouse-up/click; include their final route fixes.
      endTimer = setTimeout(() => {
        endTimer = undefined;
        gesture = false;
        flush();
      }, 0);
    },
    undo() {
      if (gesture || disposed) return false;
      flush();
      const previous = past.pop();
      if (!previous) return false;
      future.push(present);
      restore(previous);
      return true;
    },
    redo() {
      if (gesture || disposed) return false;
      flush();
      const next = future.pop();
      if (!next) return false;
      past.push(present);
      restore(next);
      return true;
    },
    dispose() {
      disposed = true;
      if (endTimer !== undefined) clearTimeout(endTimer);
      unsubscribeDoc();
      unsubscribeWorld();
    },
  };
}
