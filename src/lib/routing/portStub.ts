import { EPS, MIN_SEG } from "./constants";
import { snap } from "./geometry";
import { isPortVertex } from "./nets";
import type { RouteGraph, RouteSegment, RouteVertex } from "./types";
import type { WorkingGraph } from "./working";

type View = {
  vertex: (id: string) => RouteVertex | undefined;
  incident: (id: string) => RouteSegment[];
};

function viewGraph(graph: RouteGraph): View {
  const byId = new Map(graph.vertices.map((v) => [v.id, v]));
  return {
    vertex: (id) => byId.get(id),
    incident: (id) => graph.segments.filter((s) => s.a === id || s.b === id),
  };
}

function viewWorking(w: WorkingGraph): View {
  return {
    vertex: (id) => w.vertices.get(id),
    incident: (id) => {
      const out: RouteSegment[] = [];
      for (const s of w.segments.values()) {
        if (s.a === id || s.b === id) out.push(s);
      }
      return out;
    },
  };
}

/** +1 = stub goes right (output), -1 = stub goes left (input), 0 = unknown. */
export function outwardSign(port: RouteVertex, stubFarX?: number): 1 | -1 | 0 {
  if (port.portKind === "out") return 1;
  if (port.portKind === "in") return -1;
  if (stubFarX !== undefined) {
    if (stubFarX > port.x + EPS) return 1;
    if (stubFarX < port.x - EPS) return -1;
  }
  return 0;
}

export function xIsInward(
  port: RouteVertex,
  x: number,
  stubFarX?: number,
): boolean {
  const s = outwardSign(port, stubFarX);
  if (s > 0) return x < port.x - EPS;
  if (s < 0) return x > port.x + EPS;
  return false;
}

function hRunIds(view: View, startId: string): Set<string> {
  const ids = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    if (!view.vertex(id)) continue;
    ids.add(id);
    for (const s of view.incident(id)) {
      if (s.axis !== "h") continue;
      const o = s.a === id ? s.b : s.a;
      if (!ids.has(o)) stack.push(o);
    }
  }
  return ids;
}

function runXRange(
  view: View,
  ids: Iterable<string>,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const id of ids) {
    const v = view.vertex(id);
    if (!v) continue;
    min = Math.min(min, v.x);
    max = Math.max(max, v.x);
  }
  return { min, max };
}

function stubFarX(view: View, port: RouteVertex, run: Set<string>): number {
  const range = runXRange(view, run);
  if (port.portKind === "in") return range.min;
  if (port.portKind === "out") return range.max;
  const dMin = Math.abs(range.min - port.x);
  const dMax = Math.abs(range.max - port.x);
  return dMax >= dMin ? range.max : range.min;
}

function unionGoesInward(view: View, portId: string, otherIds: Set<string>): boolean {
  const port = view.vertex(portId);
  if (!port || !isPortVertex(port)) return false;
  const portRun = hRunIds(view, portId);
  const far = stubFarX(view, port, portRun);
  const a = runXRange(view, portRun);
  const b = runXRange(view, otherIds);
  if (!Number.isFinite(a.min) || !Number.isFinite(b.min)) return false;
  return xIsInward(port, Math.min(a.min, b.min), far) || xIsInward(port, Math.max(a.max, b.max), far);
}

/**
 * Ys (for an H drag) where landing on a same-net port stub would fuse a
 * line into the machine — the port's H would go inward.
 */
export function illegalFuseAlignments(
  graph: RouteGraph,
  segmentId: string,
): number[] {
  const seg = graph.segments.find((s) => s.id === segmentId);
  if (!seg || seg.axis !== "h") return [];
  return illegalFuseCoords(viewGraph(graph), seg);
}

function illegalFuseCoords(view: View, seg: RouteSegment): number[] {
  const run = hRunIds(view, seg.a);
  const ys = new Set<number>();
  for (const id of run) {
    for (const s of view.incident(id)) {
      if (s.axis !== "v") continue;
      const o = s.a === id ? s.b : s.a;
      if (run.has(o)) continue;
      const other = hRunIds(view, o);
      for (const oid of other) {
        const v = view.vertex(oid);
        if (!v || !isPortVertex(v)) continue;
        if (unionGoesInward(view, v.id, run)) ys.add(snap(v.y));
      }
    }
  }
  return [...ys];
}

/**
 * Skip the Y where a dragged H would sit on a port stub and fuse inward.
 * Stays on the same side of that Y as the segment currently is.
 */
export function avoidIllegalFuseCoord(
  graph: RouteGraph,
  segmentId: string,
  coord: number,
): number {
  const seg = graph.segments.find((s) => s.id === segmentId);
  if (!seg || seg.axis !== "h") return coord;
  const byId = new Map(graph.vertices.map((v) => [v.id, v]));
  const a = byId.get(seg.a);
  const b = byId.get(seg.b);
  if (!a || !b) return coord;
  const from = snap((a.y + b.y) / 2);
  let out = snap(coord);
  for (const y of illegalFuseAlignments(graph, segmentId)) {
    if (Math.abs(out - y) >= MIN_SEG) continue;
    const side = from > y + 0.5 ? 1 : from < y - 0.5 ? -1 : out >= y ? 1 : -1;
    out = snap(y + side * MIN_SEG);
  }
  return out;
}

/** True when merging `aId` and `bId` would put a port H inside its machine. */
export function mergeWouldInwardPort(
  w: WorkingGraph,
  aId: string,
  bId: string,
): boolean {
  const view = viewWorking(w);
  const runA = hRunIds(view, aId);
  if (runA.has(bId)) return false;
  const runB = hRunIds(view, bId);
  for (const id of runA) {
    const v = view.vertex(id);
    if (v && isPortVertex(v) && unionGoesInward(view, v.id, runB)) return true;
  }
  for (const id of runB) {
    const v = view.vertex(id);
    if (v && isPortVertex(v) && unionGoesInward(view, v.id, runA)) return true;
  }
  return false;
}

export function hRunHasPort(w: WorkingGraph, startId: string): boolean {
  const view = viewWorking(w);
  for (const id of hRunIds(view, startId)) {
    const v = view.vertex(id);
    if (v && isPortVertex(v)) return true;
  }
  return false;
}
