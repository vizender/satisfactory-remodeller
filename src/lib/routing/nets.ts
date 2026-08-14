import type { PortHandle, RouteGraph, RouteNet, RouteSegment, RouteVertex, TopologyEdge } from "./types";
import { nid } from "./ids";

/** Connected components of topology edges that share ports (and thus form one net). */
export function groupEdgesIntoNets(
  edges: TopologyEdge[],
  ports: Map<string, PortHandle>,
): { itemId: string; edgeIds: string[]; portIds: string[] }[] {
  const real = edges.filter((e) => !e.suggested);
  const adj = new Map<string, Set<string>>();
  const edgeByPair = new Map<string, TopologyEdge[]>();

  const addAdj = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };

  for (const e of real) {
    addAdj(e.source, e.target);
    addAdj(e.target, e.source);
    const k = [e.source, e.target].sort().join("|");
    const list = edgeByPair.get(k) ?? [];
    list.push(e);
    edgeByPair.set(k, list);
  }

  const seen = new Set<string>();
  const nets: { itemId: string; edgeIds: string[]; portIds: string[] }[] = [];

  for (const e of real) {
    if (seen.has(e.source) && seen.has(e.target)) continue;
    const start = seen.has(e.source) ? e.target : e.source;
    if (seen.has(start)) continue;
    const stack = [start];
    const component = new Set<string>();
    while (stack.length) {
      const p = stack.pop()!;
      if (seen.has(p)) continue;
      seen.add(p);
      component.add(p);
      for (const n of adj.get(p) ?? []) {
        if (!seen.has(n)) stack.push(n);
      }
    }
    const edgeIds: string[] = [];
    const edgeSeen = new Set<string>();
    for (const e2 of real) {
      if (component.has(e2.source) && component.has(e2.target) && !edgeSeen.has(e2.id)) {
        edgeSeen.add(e2.id);
        edgeIds.push(e2.id);
      }
    }
    const itemId =
      real.find((x) => edgeIds.includes(x.id))?.itemId ??
      ports.get(start)?.itemId ??
      "";
    nets.push({ itemId, edgeIds, portIds: [...component] });
  }

  return nets;
}

export function netById(graph: RouteGraph, netId: string): RouteNet | undefined {
  return graph.nets.find((n) => n.id === netId);
}

export function ensureNet(
  graph: RouteGraph,
  itemId: string,
  edgeId: string,
): RouteNet {
  const existing = graph.nets.find((n) => n.edgeIds.includes(edgeId));
  if (existing) return existing;
  const net: RouteNet = { id: nid(), itemId, edgeIds: [edgeId] };
  graph.nets.push(net);
  return net;
}

export function vertexById(
  graph: RouteGraph,
  id: string,
): RouteVertex | undefined {
  return graph.vertices.find((v) => v.id === id);
}

export function vertexByPort(
  graph: RouteGraph,
  portId: string,
): RouteVertex | undefined {
  return graph.vertices.find((v) => v.portId === portId);
}

export function segmentById(
  graph: RouteGraph,
  id: string,
): RouteSegment | undefined {
  return graph.segments.find((s) => s.id === id);
}

export function incidentSegments(
  graph: RouteGraph,
  vertexId: string,
): RouteSegment[] {
  return graph.segments.filter((s) => s.a === vertexId || s.b === vertexId);
}

export function degreeOf(graph: RouteGraph, vertexId: string): number {
  return incidentSegments(graph, vertexId).length;
}

export function otherVertexId(seg: RouteSegment, vertexId: string): string {
  return seg.a === vertexId ? seg.b : seg.a;
}

export function neighborsOf(
  graph: RouteGraph,
  vertexId: string,
  exceptSegId?: string,
): RouteSegment[] {
  return incidentSegments(graph, vertexId).filter((s) => s.id !== exceptSegId);
}

export function hasParallelNeighbor(
  graph: RouteGraph,
  seg: RouteSegment,
  vertexId: string,
): boolean {
  return neighborsOf(graph, vertexId, seg.id).some((o) => o.axis === seg.axis);
}

export function isPortVertex(v: RouteVertex): boolean {
  return v.kind === "port" || Boolean(v.portId);
}

export function isPortGluedH(graph: RouteGraph, seg: RouteSegment): boolean {
  if (seg.axis !== "h") return false;
  const va = vertexById(graph, seg.a);
  const vb = vertexById(graph, seg.b);
  return Boolean(va && isPortVertex(va)) || Boolean(vb && isPortVertex(vb));
}
