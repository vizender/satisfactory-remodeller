import { distToSegment } from "./geometry";
import type { Point, RouteGraph, TopologyEdge } from "./types";

const byId = (graph: RouteGraph) =>
  new Map(graph.vertices.map((v) => [v.id, v]));

export function nearestSegmentId(
  graph: RouteGraph,
  p: Point,
  maxDist = 16,
): string | null {
  const verts = byId(graph);
  let best: string | null = null;
  let bestD = maxDist;
  for (const s of graph.segments) {
    const a = verts.get(s.a);
    const b = verts.get(s.b);
    if (!a || !b) continue;
    const d = distToSegment(p, a, b);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

export function segmentMidpoint(graph: RouteGraph, segmentId: string): Point | null {
  const s = graph.segments.find((x) => x.id === segmentId);
  if (!s) return null;
  const verts = byId(graph);
  const a = verts.get(s.a);
  const b = verts.get(s.b);
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function incident(graph: RouteGraph, vertexId: string) {
  return graph.segments.filter((s) => s.a === vertexId || s.b === vertexId);
}

/** Unique path (tree) from source port to target port on the same net. */
export function pathForEdge(
  graph: RouteGraph,
  edge: Pick<TopologyEdge, "source" | "target">,
): string[] | null {
  const src = graph.vertices.find((v) => v.portId === edge.source);
  const tgt = graph.vertices.find((v) => v.portId === edge.target);
  if (!src || !tgt) return null;
  const prev = new Map<string, { vertex: string; seg: string }>();
  const seen = new Set<string>([src.id]);
  const q = [src.id];
  while (q.length) {
    const id = q.shift()!;
    if (id === tgt.id) break;
    for (const s of incident(graph, id)) {
      const n = s.a === id ? s.b : s.a;
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, { vertex: id, seg: s.id });
      q.push(n);
    }
  }
  if (!seen.has(tgt.id)) return null;
  const segs: string[] = [];
  let cur = tgt.id;
  while (cur !== src.id) {
    const step = prev.get(cur);
    if (!step) return null;
    segs.push(step.seg);
    cur = step.vertex;
  }
  segs.reverse();
  return segs;
}

export function segmentEdgeUsers(
  graph: RouteGraph,
  topology: TopologyEdge[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of topology) {
    const path = pathForEdge(graph, e);
    if (!path) continue;
    for (const sid of path) {
      const list = map.get(sid) ?? [];
      list.push(e.id);
      map.set(sid, list);
    }
  }
  return map;
}

export function flowOnSegment(
  graph: RouteGraph,
  segmentId: string,
  topology: TopologyEdge[],
  edgeFlow: Record<string, number>,
): number {
  const users = segmentEdgeUsers(graph, topology).get(segmentId) ?? [];
  let sum = 0;
  for (const id of users) sum += edgeFlow[id] ?? 0;
  return sum;
}
