import type { CanvasRecord } from "@/types/canvas";
import { collectDescendantCanvasIds } from "@/lib/canvasTree";
import {
  emptyRouteGraph,
  pruneRouteGraph,
  type RouteGraph,
} from "@/lib/routing";

type CanvasMap = Record<string, CanvasRecord>;
export type CanvasClipboard = { root: CanvasRecord; descendants: CanvasMap };

/** A copied wire includes its endpoint machines, so it remains usable after pasting. */
export function captureCanvasSelection(
  canvases: CanvasMap,
  canvasId: string,
  selectedEdges: Set<string> = new Set(),
): CanvasClipboard | null {
  const canvas = canvases[canvasId];
  const frames = new Set(
    canvas.nodes.filter((n) => n.selected).map((n) => n.parentId ?? n.id),
  );
  for (const e of canvas.edges)
    if (selectedEdges.has(e.id) || e.selected) {
      for (const id of [e.source, e.target]) {
        const node = canvas.nodes.find((n) => n.id === id);
        if (node) frames.add(node.parentId ?? id);
      }
    }
  if (!frames.size) return null;
  const nodes = canvas.nodes.filter(
    (n) => frames.has(n.id) || (n.parentId && frames.has(n.parentId)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = canvas.edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target),
  );
  const descendants: CanvasMap = {};
  for (const n of nodes.filter((n) => n.type === "factoryFrame")) {
    for (const id of collectDescendantCanvasIds(canvases, n.id))
      descendants[id] = canvases[id];
  }
  const root = {
    ...canvas,
    nodes,
    edges,
    forcedPortRates: Object.fromEntries(
      Object.entries(canvas.forcedPortRates).filter(([id]) => ids.has(id)),
    ),
    routeGraph: pruneRouteGraph(
      canvas.routeGraph ?? emptyRouteGraph(),
      ids,
      new Set(edges.map((e) => e.id)),
    ),
  };
  return structuredClone({ root, descendants });
}

export function pasteCanvasSelection(
  canvases: CanvasMap,
  canvasId: string,
  clipboard: CanvasClipboard,
  offset = { x: 64, y: 64 },
): CanvasMap {
  const result = { ...canvases };
  const used = new Set(
    Object.values(canvases).flatMap((c) => [c.id, ...c.nodes.map((n) => n.id)]),
  );
  const allocate = (prefix: string) => {
    let i = 1;
    while (used.has(`${prefix}${i}`)) i++;
    const id = `${prefix}${i}`;
    used.add(id);
    return id;
  };
  const records = [clipboard.root, ...Object.values(clipboard.descendants)];
  // Maps are scoped to each canvas: older imports may reuse machine ids in separate factories.
  const canvasIds = new Map(
    Object.keys(clipboard.descendants).map((id) => [id, allocate("f")]),
  );
  for (const src of records) {
    const root = src === clipboard.root;
    const id = root ? canvasId : canvasIds.get(src.id)!;
    const ids = new Map<string, string>();
    for (const n of src.nodes.filter((n) => !n.parentId))
      ids.set(
        n.id,
        n.type === "factoryFrame"
          ? (canvasIds.get(n.id) ?? allocate("f"))
          : allocate(n.type === "containerFrame" ? "c" : "m"),
      );
    for (const n of src.nodes.filter((n) => n.parentId))
      ids.set(n.id, `${ids.get(n.parentId!)}${n.id.slice(n.parentId!.length)}`);
    const edgeIds = new Map(
      src.edges.map((e) => [e.id, `e-${crypto.randomUUID()}`]),
    );
    const nodes = src.nodes.map((n) => ({
      ...structuredClone(n),
      id: ids.get(n.id)!,
      parentId: n.parentId ? ids.get(n.parentId) : undefined,
      selected: root && !n.parentId,
      position: {
        x: n.position.x + (root && !n.parentId ? offset.x : 0),
        y: n.position.y + (root && !n.parentId ? offset.y : 0),
      },
    }));
    const edges = src.edges.map((e) => ({
      ...structuredClone(e),
      id: edgeIds.get(e.id)!,
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
      selected: false,
    }));
    const graph = cloneRoutes(
      src.routeGraph ?? emptyRouteGraph(),
      ids,
      edgeIds,
      root ? offset : { x: 0, y: 0 },
    );
    const forcedPortRates = Object.fromEntries(
      Object.entries(src.forcedPortRates).map(([key, value]) => [
        ids.get(key)!,
        value,
      ]),
    );
    if (root) {
      const target = result[canvasId];
      const previous = target.routeGraph ?? emptyRouteGraph();
      result[canvasId] = {
        ...target,
        nodes: [
          ...target.nodes.map((n) => ({ ...n, selected: false })),
          ...nodes,
        ],
        edges: [
          ...target.edges.map((e) => ({ ...e, selected: false })),
          ...edges,
        ],
        forcedPortRates: { ...target.forcedPortRates, ...forcedPortRates },
        routeGraph: {
          vertices: [...previous.vertices, ...graph.vertices],
          segments: [...previous.segments, ...graph.segments],
          nets: [...previous.nets, ...graph.nets],
        },
      };
    } else {
      result[id] = {
        ...structuredClone(src),
        id,
        nodes,
        edges,
        forcedPortRates,
        routeGraph: graph,
        parent: {
          canvasId: canvasIds.get(src.parent?.canvasId ?? "") ?? canvasId,
          factoryNodeId: id,
        },
      };
    }
  }
  return result;
}

function cloneRoutes(
  graph: RouteGraph,
  nodes: Map<string, string>,
  edges: Map<string, string>,
  offset: { x: number; y: number },
): RouteGraph {
  const ids = new Map(
    [...graph.vertices, ...graph.segments, ...graph.nets].map((v) => [
      v.id,
      `clip-${crypto.randomUUID()}`,
    ]),
  );
  return {
    vertices: graph.vertices.map((v) => ({
      ...v,
      id: ids.get(v.id)!,
      portId: v.portId ? nodes.get(v.portId) : undefined,
      x: v.x + offset.x,
      y: v.y + offset.y,
    })),
    segments: graph.segments.map((s) => ({
      ...s,
      id: ids.get(s.id)!,
      a: ids.get(s.a)!,
      b: ids.get(s.b)!,
      netId: ids.get(s.netId)!,
    })),
    nets: graph.nets.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      edgeIds: n.edgeIds.map((e) => edges.get(e)!).filter(Boolean),
    })),
  };
}

export function cutCanvasSelection(
  canvases: CanvasMap,
  canvasId: string,
  selectedEdges: Set<string> = new Set(),
): CanvasMap {
  const result = { ...canvases };
  const src = canvases[canvasId];
  const frames = new Set(
    src.nodes.filter((n) => n.selected).map((n) => n.parentId ?? n.id),
  );
  for (const n of src.nodes.filter(
    (n) => frames.has(n.id) && n.type === "factoryFrame",
  )) {
    for (const id of collectDescendantCanvasIds(canvases, n.id))
      delete result[id];
  }
  const nodes = src.nodes.filter(
    (n) => !frames.has(n.id) && !(n.parentId && frames.has(n.parentId)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = src.edges.filter(
    (e) =>
      ids.has(e.source) &&
      ids.has(e.target) &&
      !e.selected &&
      !selectedEdges.has(e.id),
  );
  // Only keep ports participating in remaining edges, to remove dangling wire branches.
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
  result[canvasId] = {
    ...src,
    nodes,
    edges,
    forcedPortRates: Object.fromEntries(
      Object.entries(src.forcedPortRates).filter(([id]) => ids.has(id)),
    ),
    routeGraph: pruneRouteGraph(
      src.routeGraph ?? emptyRouteGraph(),
      connected,
      new Set(edges.map((e) => e.id)),
    ),
  };
  return result;
}
