import type {
  Axis,
  PortKind,
  RouteGraph,
  RouteNet,
  RouteSegment,
  RouteVertex,
  VertexKind,
} from "./types";
import { sid, vid } from "./ids";
import { almostEq, axisOf, snap } from "./geometry";
import { degreeOf, incidentSegments, isPortVertex, otherVertexId } from "./nets";

export type WorkingGraph = {
  vertices: Map<string, RouteVertex>;
  segments: Map<string, RouteSegment>;
  nets: Map<string, RouteNet>;
};

export function toWorking(graph: RouteGraph): WorkingGraph {
  return {
    vertices: new Map(graph.vertices.map((v) => [v.id, { ...v }])),
    segments: new Map(graph.segments.map((s) => [s.id, { ...s }])),
    nets: new Map(
      graph.nets.map((n) => [n.id, { ...n, edgeIds: [...n.edgeIds] }]),
    ),
  };
}

export function fromWorking(w: WorkingGraph): RouteGraph {
  return {
    vertices: [...w.vertices.values()],
    segments: [...w.segments.values()],
    nets: [...w.nets.values()],
  };
}

export function wDegree(w: WorkingGraph, vertexId: string): number {
  let d = 0;
  for (const s of w.segments.values()) {
    if (s.a === vertexId || s.b === vertexId) d += 1;
  }
  return d;
}

export function wIncident(w: WorkingGraph, vertexId: string): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (const s of w.segments.values()) {
    if (s.a === vertexId || s.b === vertexId) out.push(s);
  }
  return out;
}

export function kindFromDegree(deg: number, port: boolean): VertexKind {
  if (port) return "port";
  if (deg >= 4) return "4si";
  if (deg === 3) return "3si";
  return "corner";
}

export function refreshKinds(w: WorkingGraph): void {
  for (const v of w.vertices.values()) {
    const deg = wDegree(w, v.id);
    v.kind = kindFromDegree(deg, isPortVertex(v));
  }
}

export function addVertex(
  w: WorkingGraph,
  x: number,
  y: number,
  kind: VertexKind = "corner",
  portId?: string,
): RouteVertex {
  const v: RouteVertex = {
    id: vid(),
    x: snap(x),
    y: snap(y),
    kind: portId ? "port" : kind,
    portId,
  };
  w.vertices.set(v.id, v);
  return v;
}

export function addPortVertex(
  w: WorkingGraph,
  portId: string,
  x: number,
  y: number,
  portKind?: PortKind,
): RouteVertex {
  for (const v of w.vertices.values()) {
    if (v.portId === portId) {
      v.x = snap(x);
      v.y = snap(y);
      v.kind = "port";
      if (portKind) v.portKind = portKind;
      return v;
    }
  }
  const v = addVertex(w, x, y, "port", portId);
  if (portKind) v.portKind = portKind;
  return v;
}

export function addSegment(
  w: WorkingGraph,
  a: string,
  b: string,
  netId: string,
  axis?: Axis,
): RouteSegment | null {
  if (a === b) return null;
  const va = w.vertices.get(a);
  const vb = w.vertices.get(b);
  if (!va || !vb) return null;
  const ax = axis ?? axisOf(va, vb);
  if (!ax) return null;
  if (ax === "h") {
    if (!isPortVertex(vb)) vb.y = va.y;
    else if (!isPortVertex(va)) va.y = vb.y;
  } else if (!isPortVertex(vb)) {
    vb.x = va.x;
  } else if (!isPortVertex(va)) {
    va.x = vb.x;
  }
  for (const s of w.segments.values()) {
    if (s.netId !== netId) continue;
    if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return s;
  }
  const seg: RouteSegment = { id: sid(), a, b, axis: ax, netId };
  w.segments.set(seg.id, seg);
  return seg;
}

export function removeSegment(w: WorkingGraph, id: string): void {
  w.segments.delete(id);
}

export function removeVertex(w: WorkingGraph, id: string): void {
  for (const s of [...w.segments.values()]) {
    if (s.a === id || s.b === id) w.segments.delete(s.id);
  }
  w.vertices.delete(id);
}

export function findVertexAt(
  w: WorkingGraph,
  x: number,
  y: number,
  netId?: string,
  eps = 1,
): RouteVertex | undefined {
  for (const v of w.vertices.values()) {
    if (!almostEq(v.x, x, eps) || !almostEq(v.y, y, eps)) continue;
    if (netId) {
      const segs = wIncident(w, v.id);
      if (segs.length > 0 && segs.every((s) => s.netId !== netId)) continue;
      if (segs.length === 0 && v.portId) {
        /* isolated port — ok */
      }
    }
    return v;
  }
  return undefined;
}

export function getOrCreateAt(
  w: WorkingGraph,
  x: number,
  y: number,
  netId: string,
  portId?: string,
): RouteVertex {
  if (portId) return addPortVertex(w, portId, x, y);
  const existing = findVertexAt(w, x, y, netId);
  if (existing && !existing.portId) return existing;
  return addVertex(w, x, y);
}

/** Split `seg` at an existing or new vertex sitting on it. Returns the vertex. */
export function splitSegmentAt(
  w: WorkingGraph,
  seg: RouteSegment,
  x: number,
  y: number,
): RouteVertex | null {
  const va = w.vertices.get(seg.a);
  const vb = w.vertices.get(seg.b);
  if (!va || !vb) return null;
  if (almostEq(va.x, x) && almostEq(va.y, y)) return va;
  if (almostEq(vb.x, x) && almostEq(vb.y, y)) return vb;
  const mid = addVertex(w, x, y);
  const netId = seg.netId;
  const axis = seg.axis;
  w.segments.delete(seg.id);
  const s1: RouteSegment = { id: sid(), a: seg.a, b: mid.id, axis, netId };
  const s2: RouteSegment = { id: sid(), a: mid.id, b: seg.b, axis, netId };
  w.segments.set(s1.id, s1);
  w.segments.set(s2.id, s2);
  return mid;
}

export function findSegmentOnPoint(
  w: WorkingGraph,
  netId: string,
  x: number,
  y: number,
  axis?: Axis,
): RouteSegment | undefined {
  for (const s of w.segments.values()) {
    if (s.netId !== netId) continue;
    if (axis && s.axis !== axis) continue;
    const va = w.vertices.get(s.a);
    const vb = w.vertices.get(s.b);
    if (!va || !vb) continue;
    if (s.axis === "h") {
      if (!almostEq(va.y, y) || !almostEq(vb.y, y)) continue;
      const lo = Math.min(va.x, vb.x);
      const hi = Math.max(va.x, vb.x);
      if (x >= lo - 0.5 && x <= hi + 0.5) return s;
    } else {
      if (!almostEq(va.x, x) || !almostEq(vb.x, x)) continue;
      const lo = Math.min(va.y, vb.y);
      const hi = Math.max(va.y, vb.y);
      if (y >= lo - 0.5 && y <= hi + 0.5) return s;
    }
  }
  return undefined;
}

export function asGraph(w: WorkingGraph): RouteGraph {
  refreshKinds(w);
  return fromWorking(w);
}

/** Keep graph helpers usable without working maps. */
export function collinearPair(
  graph: RouteGraph,
  vertexId: string,
): [RouteSegment, RouteSegment] | null {
  const segs = incidentSegments(graph, vertexId);
  if (segs.length !== 2) return null;
  const [s0, s1] = segs;
  if (!s0 || !s1 || s0.axis !== s1.axis) return null;
  const v = graph.vertices.find((x) => x.id === vertexId);
  if (!v || isPortVertex(v)) return null;
  const a0 = otherVertexId(s0, vertexId);
  const a1 = otherVertexId(s1, vertexId);
  const va = graph.vertices.find((x) => x.id === a0);
  const vb = graph.vertices.find((x) => x.id === a1);
  if (!va || !vb) return null;
  if (s0.axis === "h") {
    if (!almostEq(va.y, v.y) || !almostEq(vb.y, v.y)) return null;
  } else if (!almostEq(va.x, v.x) || !almostEq(vb.x, v.x)) return null;
  return [s0, s1];
}

export function graphDegree(graph: RouteGraph, vertexId: string): number {
  return degreeOf(graph, vertexId);
}
