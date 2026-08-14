import { MIN_PORT_STUB } from "./constants";
import { almostEq, axisOf, snap } from "./geometry";
import { isPortVertex } from "./nets";
import { collapseWorking } from "./collapse";
import {
  clearNetGeometry,
  layoutReverseNet,
  stubsOverlap,
} from "./layout";
import type { PortHandle, RouteGraph, RouteSegment } from "./types";
import {
  addSegment,
  asGraph,
  getOrCreateAt,
  toWorking,
  wDegree,
  wIncident,
  type WorkingGraph,
} from "./working";

function stubSegment(
  w: WorkingGraph,
  portId: string,
): RouteSegment | undefined {
  return wIncident(w, portId).find((s) => s.axis === "h");
}

function stubFarId(w: WorkingGraph, portId: string): string | undefined {
  const s = stubSegment(w, portId);
  if (!s) return undefined;
  return s.a === portId ? s.b : s.a;
}

function verticalRunIds(w: WorkingGraph, startId: string): string[] {
  const ids = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    const v = w.vertices.get(id);
    if (!v) continue;
    if (isPortVertex(v) && id !== startId) continue;
    ids.add(id);
    for (const s of wIncident(w, id)) {
      if (s.axis !== "v") continue;
      const o = s.a === id ? s.b : s.a;
      if (!ids.has(o)) stack.push(o);
    }
  }
  return [...ids];
}

function setVerticalRunX(w: WorkingGraph, startId: string, x: number): void {
  const nx = snap(x);
  for (const id of verticalRunIds(w, startId)) {
    const v = w.vertices.get(id);
    if (v && !isPortVertex(v)) v.x = nx;
  }
}

function glueStubY(w: WorkingGraph, portId: string): void {
  const port = w.vertices.get(portId);
  const farId = stubFarId(w, portId);
  if (!port || !farId) return;
  const far = w.vertices.get(farId);
  if (!far || isPortVertex(far)) return;
  far.y = port.y;
}

/**
 * Keep the H stub pointing away from the machine, at least MIN_PORT_STUB.
 * If the far vertex would sit closer or inside, slide its vertical run in X.
 */
function enforceMinOutwardStub(
  w: WorkingGraph,
  port: PortHandle,
): void {
  const pv = [...w.vertices.values()].find((v) => v.portId === port.portId);
  if (!pv) return;
  const farId = stubFarId(w, pv.id);
  if (!farId) return;
  const far = w.vertices.get(farId);
  if (!far || isPortVertex(far)) return;
  glueStubY(w, pv.id);
  const minFarX =
    port.kind === "out"
      ? snap(pv.x + MIN_PORT_STUB)
      : snap(pv.x - MIN_PORT_STUB);
  if (port.kind === "out" && far.x + 0.5 >= minFarX) return;
  if (port.kind === "in" && far.x - 0.5 <= minFarX) return;
  setVerticalRunX(w, farId, minFarX);
}

function netPortHandles(
  w: WorkingGraph,
  netId: string,
  byPort: Map<string, PortHandle>,
): { sources: PortHandle[]; targets: PortHandle[] } {
  const ids = new Set<string>();
  for (const s of w.segments.values()) {
    if (s.netId !== netId) continue;
    for (const vid of [s.a, s.b]) {
      const v = w.vertices.get(vid);
      if (v?.portId) ids.add(v.portId);
    }
  }
  const sources: PortHandle[] = [];
  const targets: PortHandle[] = [];
  for (const id of ids) {
    const h = byPort.get(id);
    if (!h) continue;
    if (h.kind === "out") sources.push(h);
    else targets.push(h);
  }
  return { sources, targets };
}

function sharedVerticalRun(
  w: WorkingGraph,
  aId: string,
  bId: string,
): boolean {
  return verticalRunIds(w, aId).includes(bId);
}

/** Forward 1-to-1 (or bus) whose V still sits between the ports. */
function isForwardBetween(
  w: WorkingGraph,
  sources: PortHandle[],
  targets: PortHandle[],
): boolean {
  if (sources.length === 0 || targets.length === 0) return false;
  const srcV = [...w.vertices.values()].find(
    (v) => v.portId === sources[0]!.portId,
  );
  const tgtV = [...w.vertices.values()].find(
    (v) => v.portId === targets[0]!.portId,
  );
  if (!srcV || !tgtV) return false;
  const srcFar = stubFarId(w, srcV.id);
  const tgtFar = stubFarId(w, tgtV.id);
  if (!srcFar || !tgtFar) return true;
  if (srcFar === tgtFar) return true;
  return sharedVerticalRun(w, srcFar, tgtFar);
}

function netFullyCrossed(sources: PortHandle[], targets: PortHandle[]): boolean {
  if (sources.length === 0 || targets.length === 0) return false;
  const maxSx = Math.max(...sources.map((p) => p.x));
  const minTx = Math.min(...targets.map((p) => p.x));
  return stubsOverlap(maxSx, minTx);
}

function repairPortToPort(
  w: WorkingGraph,
  seg: RouteSegment,
  aId: string,
  bId: string,
  byPort: Map<string, PortHandle>,
): void {
  const a = w.vertices.get(aId);
  const b = w.vertices.get(bId);
  if (!a?.portId || !b?.portId) return;
  const ha = byPort.get(a.portId);
  const hb = byPort.get(b.portId);
  if (!ha || !hb) return;
  const src = ha.kind === "out" ? ha : hb;
  const tgt = ha.kind === "in" ? ha : hb;
  const netId = seg.netId;
  if (stubsOverlap(src.x, tgt.x)) {
    clearNetGeometry(w, netId);
    layoutReverseNet(w, [src], [tgt], netId);
    return;
  }
  w.segments.delete(seg.id);
  if (almostEq(a.y, b.y)) {
    addSegment(w, a.id, b.id, netId, "h");
    return;
  }
  const lo = snap(src.x + MIN_PORT_STUB);
  const hi = snap(tgt.x - MIN_PORT_STUB);
  const midX = hi > lo ? snap((src.x + tgt.x) / 2) : lo;
  const c1 = getOrCreateAt(w, midX, src.y, netId);
  const c2 = getOrCreateAt(w, midX, tgt.y, netId);
  const srcV = ha.kind === "out" ? a : b;
  const tgtV = ha.kind === "in" ? a : b;
  addSegment(w, srcV.id, c1.id, netId, "h");
  addSegment(w, c1.id, c2.id, netId, "v");
  addSegment(w, c2.id, tgtV.id, netId, "h");
}

function insertJogToFar(
  w: WorkingGraph,
  seg: RouteSegment,
  portId: string,
  farId: string,
): void {
  const port = w.vertices.get(portId);
  const far = w.vertices.get(farId);
  if (!port || !far) return;
  const netId = seg.netId;
  w.segments.delete(seg.id);
  const c = getOrCreateAt(w, far.x, port.y, netId);
  addSegment(w, port.id, c.id, netId, "h");
  if (!almostEq(c.y, far.y) || !almostEq(c.x, far.x)) {
    if (almostEq(c.x, far.x)) addSegment(w, c.id, far.id, netId, "v");
    else if (almostEq(c.y, far.y)) addSegment(w, c.id, far.id, netId, "h");
    else {
      const elbow = getOrCreateAt(w, far.x, port.y, netId);
      addSegment(w, c.id, elbow.id, netId, "h");
      addSegment(w, elbow.id, far.id, netId, "v");
    }
  }
}

/**
 * Port vertices follow handles. H stubs stay min-length and point away from
 * the machine; the first V slides in X when that would be violated.
 * Crossing a forward net past the opposite ports rebuilds a reverse wrap.
 * Reverse nets only slide their Vs (no extra kinks).
 */
export function followPortVertices(
  graph: RouteGraph,
  ports: PortHandle[],
): RouteGraph {
  const w = toWorking(graph);
  const byPort = new Map(ports.map((p) => [p.portId, p]));

  for (const v of w.vertices.values()) {
    if (!v.portId) continue;
    const p = byPort.get(v.portId);
    if (!p) continue;
    v.x = snap(p.x);
    v.y = snap(p.y);
    v.portKind = p.kind;
  }

  for (const v of [...w.vertices.values()]) {
    if (!v.portId) continue;
    for (const s of wIncident(w, v.id)) {
      if (!w.segments.has(s.id)) continue;
      const otherId = s.a === v.id ? s.b : s.a;
      const other = w.vertices.get(otherId);
      if (!other) continue;
      const ax = axisOf(v, other);
      if (ax === s.axis) continue;
      if (isPortVertex(other)) {
        repairPortToPort(w, s, v.id, other.id, byPort);
        continue;
      }
      if (s.axis === "h" && wDegree(w, other.id) === 2) {
        const rest = wIncident(w, other.id).find((x) => x.id !== s.id);
        if (rest?.axis === "v") {
          other.y = v.y;
          continue;
        }
      }
      insertJogToFar(w, s, v.id, other.id);
    }
  }

  const flipped = new Set<string>();
  for (const net of w.nets.values()) {
    const { sources, targets } = netPortHandles(w, net.id, byPort);
    if (sources.length === 0 || targets.length === 0) continue;
    if (!netFullyCrossed(sources, targets)) continue;
    if (!isForwardBetween(w, sources, targets)) continue;
    clearNetGeometry(w, net.id);
    layoutReverseNet(w, sources, targets, net.id);
    flipped.add(net.id);
  }

  for (const p of ports) {
    const pv = [...w.vertices.values()].find((v) => v.portId === p.portId);
    if (!pv) continue;
    const stub = stubSegment(w, pv.id);
    if (stub && flipped.has(stub.netId)) continue;
    enforceMinOutwardStub(w, p);
  }

  collapseWorking(w);
  return asGraph(w);
}

export function applyMachineDrag(
  graph: RouteGraph,
  ports: PortHandle[],
): RouteGraph {
  return followPortVertices(graph, ports);
}
