import { almostEq } from "./geometry";
import { isPortVertex } from "./nets";
import { cascadeDegree1, collapseWorking } from "./collapse";
import type { DeleteSegmentResult, RouteGraph, TopologyEdge } from "./types";
import {
  addSegment,
  asGraph,
  refreshKinds,
  removeSegment,
  removeVertex,
  toWorking,
  wDegree,
  wIncident,
  type WorkingGraph,
} from "./working";

function mergeCollinearAt(w: WorkingGraph, vertexId: string): void {
  const v = w.vertices.get(vertexId);
  if (!v || isPortVertex(v)) return;
  const segs = wIncident(w, vertexId);
  if (segs.length !== 2) return;
  const [s0, s1] = segs;
  if (!s0 || !s1 || s0.axis !== s1.axis || s0.netId !== s1.netId) return;
  const a = s0.a === vertexId ? s0.b : s0.a;
  const b = s1.a === vertexId ? s1.b : s1.a;
  if (a === b) return;
  const va = w.vertices.get(a);
  const vb = w.vertices.get(b);
  if (!va || !vb) return;
  if (s0.axis === "h" && (!almostEq(va.y, v.y) || !almostEq(vb.y, v.y))) return;
  if (s0.axis === "v" && (!almostEq(va.x, v.x) || !almostEq(vb.x, v.x))) return;
  removeSegment(w, s0.id);
  removeSegment(w, s1.id);
  addSegment(w, a, b, s0.netId, s0.axis);
  removeVertex(w, vertexId);
}

function bfsConnected(w: WorkingGraph, fromId: string, toId: string): boolean {
  if (fromId === toId) return true;
  const seen = new Set<string>([fromId]);
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const s of wIncident(w, id)) {
      const n = s.a === id ? s.b : s.a;
      if (seen.has(n)) continue;
      seen.add(n);
      if (n === toId) return true;
      stack.push(n);
    }
  }
  return false;
}

function pruneDisconnectedEdges(
  w: WorkingGraph,
  topology: TopologyEdge[],
): string[] {
  const removed: string[] = [];
  const portVertex = (portId: string) =>
    [...w.vertices.values()].find((v) => v.portId === portId);

  for (const net of w.nets.values()) {
    const keep: string[] = [];
    for (const eid of net.edgeIds) {
      const e = topology.find((t) => t.id === eid);
      if (!e) {
        removed.push(eid);
        continue;
      }
      const a = portVertex(e.source);
      const b = portVertex(e.target);
      if (!a || !b || !bfsConnected(w, a.id, b.id)) {
        removed.push(eid);
        continue;
      }
      keep.push(eid);
    }
    net.edgeIds = keep;
  }
  for (const [id, net] of [...w.nets.entries()]) {
    if (net.edgeIds.length === 0) w.nets.delete(id);
  }
  return removed;
}

/**
 * Delete a segment and cascade illegal degree-1 vertices.
 * Logical edges whose port-to-port path is gone are reported in `removedEdgeIds`.
 */
export function deleteSegment(
  graph: RouteGraph,
  segmentId: string,
  topology: TopologyEdge[] = [],
): DeleteSegmentResult {
  const w = toWorking(graph);
  if (!w.segments.has(segmentId)) {
    return { graph, removedEdgeIds: [] };
  }
  const seg = w.segments.get(segmentId)!;
  const ends = [seg.a, seg.b];
  removeSegment(w, segmentId);
  cascadeDegree1(w);
  refreshKinds(w);
  for (const id of ends) {
    if (!w.vertices.has(id)) continue;
    const deg = wDegree(w, id);
    if (deg === 2) mergeCollinearAt(w, id);
  }
  for (const v of [...w.vertices.values()]) {
    if (isPortVertex(v) && wDegree(w, v.id) === 0) {
      w.vertices.delete(v.id);
    }
  }
  const removedEdgeIds = pruneDisconnectedEdges(w, topology);
  collapseWorking(w);
  return { graph: asGraph(w), removedEdgeIds };
}

/** Drop geometry exclusive to a logical edge, keep shared trunks. */
export function removeTopologyEdge(
  graph: RouteGraph,
  edgeId: string,
  topology: TopologyEdge[],
): DeleteSegmentResult {
  const net = graph.nets.find((n) => n.edgeIds.includes(edgeId));
  if (!net) return { graph, removedEdgeIds: [edgeId] };
  const edge = topology.find((e) => e.id === edgeId);
  const others = topology.filter(
    (e) => e.id !== edgeId && net.edgeIds.includes(e.id),
  );
  if (!edge || others.length === 0) {
    const w = toWorking(graph);
    for (const s of [...w.segments.values()]) {
      if (s.netId === net.id) w.segments.delete(s.id);
    }
    for (const v of [...w.vertices.values()]) {
      if (wIncident(w, v.id).length === 0) w.vertices.delete(v.id);
    }
    w.nets.delete(net.id);
    collapseWorking(w);
    return { graph: asGraph(w), removedEdgeIds: [edgeId] };
  }
  const w = toWorking(graph);
  const n = w.nets.get(net.id);
  if (n) n.edgeIds = n.edgeIds.filter((id) => id !== edgeId);
  const removedEdgeIds = pruneDisconnectedEdges(w, others);
  void removedEdgeIds;
  collapseWorking(w);
  return { graph: asGraph(w), removedEdgeIds: [edgeId] };
}

export function pruneRouteGraph(
  graph: RouteGraph,
  validPortIds: Set<string>,
  validEdgeIds: Set<string>,
): RouteGraph {
  const w = toWorking(graph);
  for (const net of w.nets.values()) {
    net.edgeIds = net.edgeIds.filter((id) => validEdgeIds.has(id));
  }
  for (const [id, net] of [...w.nets.entries()]) {
    if (net.edgeIds.length === 0) {
      for (const s of [...w.segments.values()]) {
        if (s.netId === id) w.segments.delete(s.id);
      }
      w.nets.delete(id);
    }
  }
  for (const v of [...w.vertices.values()]) {
    if (v.portId && !validPortIds.has(v.portId)) {
      for (const s of wIncident(w, v.id)) w.segments.delete(s.id);
      w.vertices.delete(v.id);
    }
  }
  cascadeDegree1(w);
  collapseWorking(w);
  return asGraph(w);
}
