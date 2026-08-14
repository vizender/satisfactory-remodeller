import {
  BACKWARDS_STUB,
  FORWARD_MIN_GAP,
  MIN_PORT_STUB,
  REVERSE_CLEARANCE,
  STUB_LEN,
} from "./constants";
import { almostEq, snap } from "./geometry";
import { groupEdgesIntoNets } from "./nets";
import { collapseWorking } from "./collapse";
import { nid, syncRouteIds } from "./ids";
import type { PortHandle, RouteGraph, TopologyEdge } from "./types";
import { emptyRouteGraph } from "./types";
import {
  addPortVertex,
  addSegment,
  asGraph,
  findSegmentOnPoint,
  findVertexAt,
  getOrCreateAt,
  splitSegmentAt,
  toWorking,
  wIncident,
  type WorkingGraph,
} from "./working";

export function isForward(sx: number, tx: number): boolean {
  return tx - sx >= FORWARD_MIN_GAP;
}

/** True when min outward stubs cannot both fit between source and target. */
export function stubsOverlap(srcX: number, tgtX: number): boolean {
  return srcX + MIN_PORT_STUB > tgtX - MIN_PORT_STUB;
}

/** Source is not to the left of the target, or there is no room for min stubs. */
export function needsReverseWrap(srcX: number, tgtX: number): boolean {
  return !isForward(srcX, tgtX) || stubsOverlap(srcX, tgtX);
}

function layoutOneToOne(
  w: WorkingGraph,
  src: PortHandle,
  tgt: PortHandle,
  netId: string,
): void {
  const s = addPortVertex(w, src.portId, src.x, src.y, src.kind);
  const t = addPortVertex(w, tgt.portId, tgt.x, tgt.y, tgt.kind);
  const sameY = almostEq(src.y, tgt.y);

  if (needsReverseWrap(src.x, tgt.x)) {
    layoutReverseNet(w, [src], [tgt], netId);
    return;
  }

  if (sameY) {
    t.y = s.y;
    addSegment(w, s.id, t.id, netId, "h");
    return;
  }

  let midX = snap((src.x + tgt.x) / 2);
  const lo = src.x + MIN_PORT_STUB;
  const hi = tgt.x - MIN_PORT_STUB;
  if (hi > lo) {
    midX = Math.max(lo, Math.min(hi, midX));
  } else {
    midX = snap(src.x + STUB_LEN);
  }
  midX = snap(midX);
  const c1 = getOrCreateAt(w, midX, src.y, netId);
  const c2 = getOrCreateAt(w, midX, tgt.y, netId);
  addSegment(w, s.id, c1.id, netId, "h");
  addSegment(w, c1.id, c2.id, netId, "v");
  addSegment(w, c2.id, t.id, netId, "h");
}

/**
 * Y of the reverse wrap's long H: above the ports, below them, or in a
 * gap between them. Picks the candidate that minimizes total |portY - busY|
 * while staying at least REVERSE_CLEARANCE from every port.
 */
export function reverseBusY(
  ys: number[],
  preferBelowOnTie = false,
): number {
  const C = REVERSE_CLEARANCE;
  const sorted = [...new Set(ys.map((y) => snap(y)))].sort((a, b) => a - b);
  const minY = sorted[0] ?? 0;
  const maxY = sorted[sorted.length - 1] ?? 0;
  const mean =
    ys.length === 0 ? 0 : ys.reduce((s, y) => s + y, 0) / ys.length;
  const above = snap(minY - C);
  const below = snap(maxY + C);
  const candidates: number[] = [above, below];
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = snap(sorted[i]! + C);
    const hi = snap(sorted[i + 1]! - C);
    if (hi >= lo) {
      candidates.push(snap(Math.max(lo, Math.min(hi, mean))));
    }
  }

  const cost = (bus: number) =>
    ys.reduce((s, y) => s + Math.abs(y - bus), 0);

  let best = above;
  let bestCost = cost(best);
  for (const bus of candidates) {
    const c = cost(bus);
    if (c < bestCost - 0.5) {
      best = bus;
      bestCost = c;
      continue;
    }
    if (c > bestCost + 0.5) continue;
    const dBest = Math.abs(best - mean);
    const dBus = Math.abs(bus - mean);
    if (dBus < dBest - 0.5) {
      best = bus;
      continue;
    }
    if (dBus > dBest + 0.5) continue;
    if (preferBelowOnTie && almostEq(bus, below)) best = bus;
    if (!preferBelowOnTie && almostEq(bus, above)) best = bus;
  }
  return best;
}

/**
 * Reverse wrap for one or more ports: min H stub away from each machine,
 * verticals to a bus on the shorter side (or in a gap), long H along that bus.
 */
export function layoutReverseNet(
  w: WorkingGraph,
  sources: PortHandle[],
  targets: PortHandle[],
  netId: string,
): void {
  const ys = [...sources, ...targets].map((p) => p.y);
  const tgtMean =
    targets.reduce((s, p) => s + p.y, 0) / Math.max(targets.length, 1);
  const srcMean =
    sources.reduce((s, p) => s + p.y, 0) / Math.max(sources.length, 1);
  const midY = reverseBusY(ys, tgtMean > srcMean + 0.5);
  const busXs: number[] = [];
  for (const src of sources) {
    const s = addPortVertex(w, src.portId, src.x, src.y, src.kind);
    const outX = snap(src.x + MIN_PORT_STUB);
    const c1 = getOrCreateAt(w, outX, src.y, netId);
    const c2 = getOrCreateAt(w, outX, midY, netId);
    addSegment(w, s.id, c1.id, netId, "h");
    addSegment(w, c1.id, c2.id, netId, "v");
    busXs.push(outX);
  }
  for (const tgt of targets) {
    const t = addPortVertex(w, tgt.portId, tgt.x, tgt.y, tgt.kind);
    let inX = snap(tgt.x - MIN_PORT_STUB);
    const maxOut = sources.length
      ? Math.max(...sources.map((s) => snap(s.x + MIN_PORT_STUB)))
      : inX;
    if (inX >= maxOut) inX = snap(maxOut - MIN_PORT_STUB);
    const c4 = getOrCreateAt(w, inX, tgt.y, netId);
    const c3 = getOrCreateAt(w, inX, midY, netId);
    addSegment(w, t.id, c4.id, netId, "h");
    addSegment(w, c4.id, c3.id, netId, "v");
    busXs.push(inX);
  }
  const sorted = [...new Set(busXs.map((x) => snap(x)))].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = getOrCreateAt(w, sorted[i]!, midY, netId);
    const b = getOrCreateAt(w, sorted[i + 1]!, midY, netId);
    addSegment(w, a.id, b.id, netId, "h");
  }
}

export function clearNetGeometry(w: WorkingGraph, netId: string): void {
  for (const s of [...w.segments.values()]) {
    if (s.netId === netId) w.segments.delete(s.id);
  }
  for (const v of [...w.vertices.values()]) {
    if (v.portId) continue;
    if (wIncident(w, v.id).length === 0) w.vertices.delete(v.id);
  }
}

function busXFor(sources: PortHandle[], targets: PortHandle[]): number {
  const maxSx = Math.max(...sources.map((p) => p.x));
  const minTx = Math.min(...targets.map((p) => p.x));
  const stub = snap(maxSx + STUB_LEN);
  if (minTx - MIN_PORT_STUB > stub) return stub;
  if (isForward(maxSx, minTx)) {
    const mid = snap((maxSx + minTx) / 2);
    const lo = maxSx + MIN_PORT_STUB;
    const hi = minTx - MIN_PORT_STUB;
    if (hi > lo) return Math.max(lo, Math.min(hi, mid));
  }
  return snap(maxSx + BACKWARDS_STUB);
}

function layoutBus(
  w: WorkingGraph,
  sources: PortHandle[],
  targets: PortHandle[],
  netId: string,
): void {
  const bx = busXFor(sources, targets);
  const ys = new Set<number>();
  for (const p of [...sources, ...targets]) {
    const v = addPortVertex(w, p.portId, p.x, p.y, p.kind);
    const j = getOrCreateAt(w, bx, p.y, netId);
    j.y = v.y;
    addSegment(w, v.id, j.id, netId, "h");
    ys.add(snap(p.y));
  }
  const sorted = [...ys].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const y0 = sorted[i]!;
    const y1 = sorted[i + 1]!;
    if (almostEq(y0, y1)) continue;
    const a = getOrCreateAt(w, bx, y0, netId);
    const b = getOrCreateAt(w, bx, y1, netId);
    addSegment(w, a.id, b.id, netId, "v");
  }
}

function layoutNet(
  w: WorkingGraph,
  ports: Map<string, PortHandle>,
  netEdges: TopologyEdge[],
  netId: string,
): void {
  const sources: PortHandle[] = [];
  const targets: PortHandle[] = [];
  const seenS = new Set<string>();
  const seenT = new Set<string>();
  for (const e of netEdges) {
    const s = ports.get(e.source);
    const t = ports.get(e.target);
    if (s && !seenS.has(s.portId)) {
      seenS.add(s.portId);
      sources.push(s);
    }
    if (t && !seenT.has(t.portId)) {
      seenT.add(t.portId);
      targets.push(t);
    }
  }
  if (sources.length === 0 || targets.length === 0) return;
  const maxSx = Math.max(...sources.map((p) => p.x));
  const minTx = Math.min(...targets.map((p) => p.x));
  if (needsReverseWrap(maxSx, minTx)) {
    layoutReverseNet(w, sources, targets, netId);
    return;
  }
  if (sources.length === 1 && targets.length === 1) {
    layoutOneToOne(w, sources[0]!, targets[0]!, netId);
    return;
  }
  layoutBus(w, sources, targets, netId);
}

export function buildRouteGraph(
  ports: PortHandle[],
  edges: TopologyEdge[],
): RouteGraph {
  const portMap = new Map(ports.map((p) => [p.portId, p]));
  const groups = groupEdgesIntoNets(edges, portMap);
  const w = toWorking(emptyRouteGraph());
  const edgeById = new Map(edges.map((e) => [e.id, e]));

  for (const g of groups) {
    const netId = nid();
    w.nets.set(netId, { id: netId, itemId: g.itemId, edgeIds: [...g.edgeIds] });
    const netEdges = g.edgeIds
      .map((id) => edgeById.get(id))
      .filter((e): e is TopologyEdge => Boolean(e));
    layoutNet(w, portMap, netEdges, netId);
  }

  collapseWorking(w);
  const graph = asGraph(w);
  syncRouteIds(graph);
  return graph;
}

function netIdForVertex(w: WorkingGraph, vertexId: string): string | undefined {
  return wIncident(w, vertexId)[0]?.netId;
}

/**
 * Split the port's H stub at min-stub X so a 3SI can grow a new branch.
 */
function stubJunction(
  w: WorkingGraph,
  portVertexId: string,
  towardPositiveX: boolean,
): string {
  const port = w.vertices.get(portVertexId);
  if (!port) return portVertexId;
  const segs = wIncident(w, portVertexId).filter((s) => s.axis === "h");
  const stubX = snap(
    port.x + (towardPositiveX ? MIN_PORT_STUB : -MIN_PORT_STUB),
  );
  if (segs.length === 0) {
    return getOrCreateAt(w, stubX, port.y, netIdForVertex(w, portVertexId) ?? "").id;
  }
  const seg = segs[0]!;
  const mid = splitSegmentAt(w, seg, stubX, port.y);
  return mid?.id ?? portVertexId;
}

/** Walk collinear V segments on this bus until there is no further step toward `y`. */
function busEndToward(
  w: WorkingGraph,
  start: { id: string; y: number },
  y: number,
  netId: string,
): { id: string; y: number } {
  const down = y > start.y + 0.5;
  let cur = start;
  const seen = new Set<string>();
  while (!seen.has(cur.id)) {
    seen.add(cur.id);
    const step = wIncident(w, cur.id).find((s) => {
      if (s.axis !== "v" || s.netId !== netId) return false;
      const oid = s.a === cur.id ? s.b : s.a;
      const ov = w.vertices.get(oid);
      if (!ov) return false;
      return down ? ov.y > cur.y + 0.5 : ov.y < cur.y - 0.5;
    });
    if (!step) return cur;
    const oid = step.a === cur.id ? step.b : step.a;
    const ov = w.vertices.get(oid);
    if (!ov) return cur;
    cur = ov;
  }
  return cur;
}

function extendBusAndBranch(
  w: WorkingGraph,
  junctionId: string,
  target: PortHandle,
  netId: string,
): void {
  const j = w.vertices.get(junctionId);
  if (!j) return;
  const y = snap(target.y);
  const bx = j.x;

  if (almostEq(j.y, y)) {
    routeFromJunctionToPort(w, j.id, target, netId);
    return;
  }

  const existing = findVertexAt(w, bx, y, netId);
  if (existing && !existing.portId) {
    routeFromJunctionToPort(w, existing.id, target, netId);
    return;
  }

  const onSeg = findSegmentOnPoint(w, netId, bx, y, "v");
  if (onSeg) {
    const mid = splitSegmentAt(w, onSeg, bx, y);
    if (mid) routeFromJunctionToPort(w, mid.id, target, netId);
    return;
  }

  const end = busEndToward(w, j, y, netId);
  const bus = getOrCreateAt(w, bx, y, netId);
  addSegment(w, end.id, bus.id, netId, "v");
  routeFromJunctionToPort(w, bus.id, target, netId);
}

function routeFromJunctionToPort(
  w: WorkingGraph,
  fromId: string,
  target: PortHandle,
  netId: string,
): void {
  const from = w.vertices.get(fromId);
  if (!from) return;
  const t = addPortVertex(w, target.portId, target.x, target.y, target.kind);
  if (almostEq(from.y, t.y)) {
    addSegment(w, from.id, t.id, netId, "h");
    return;
  }
  const c = getOrCreateAt(w, from.x, t.y, netId);
  addSegment(w, from.id, c.id, netId, "v");
  addSegment(w, c.id, t.id, netId, "h");
}

function handlesOnNet(
  w: WorkingGraph,
  netId: string,
  portMap: Map<string, PortHandle>,
  extra: PortHandle[],
): PortHandle[] {
  const byId = new Map(extra.map((p) => [p.portId, p]));
  for (const s of w.segments.values()) {
    if (s.netId !== netId) continue;
    for (const vid of [s.a, s.b]) {
      const v = w.vertices.get(vid);
      if (!v?.portId || byId.has(v.portId)) continue;
      const h = portMap.get(v.portId);
      if (h) byId.set(v.portId, h);
    }
  }
  return [...byId.values()];
}

function relayoutNet(
  w: WorkingGraph,
  netId: string,
  portMap: Map<string, PortHandle>,
  extra: PortHandle[],
): void {
  const handles = handlesOnNet(w, netId, portMap, extra);
  const sources = handles.filter((h) => h.kind === "out");
  const targets = handles.filter((h) => h.kind === "in");
  clearNetGeometry(w, netId);
  layoutNet(w, new Map(handles.map((h) => [h.portId, h])), [
    ...sources.flatMap((s) =>
      targets.map((t) => ({
        id: `${s.portId}->${t.portId}`,
        source: s.portId,
        target: t.portId,
        itemId: s.itemId,
      })),
    ),
  ], netId);
}

/**
 * Least-change: insert a 3SI on the existing source (or target) stub and add a
 * branch. Used when a new logical edge joins a net that already has geometry.
 */
export function addTopologyEdge(
  graph: RouteGraph,
  ports: PortHandle[],
  edge: TopologyEdge,
): RouteGraph {
  if (edge.suggested) return graph;
  if (graph.nets.some((n) => n.edgeIds.includes(edge.id))) return graph;

  const portMap = new Map(ports.map((p) => [p.portId, p]));
  const src = portMap.get(edge.source);
  const tgt = portMap.get(edge.target);
  if (!src || !tgt) return graph;

  const w = toWorking(graph);
  const srcV = [...w.vertices.values()].find((v) => v.portId === edge.source);
  const tgtV = [...w.vertices.values()].find((v) => v.portId === edge.target);

  if (srcV && tgtV) {
    const n1 = netIdForVertex(w, srcV.id);
    const n2 = netIdForVertex(w, tgtV.id);
    if (n1 && n1 === n2) {
      const net = w.nets.get(n1);
      if (net && !net.edgeIds.includes(edge.id)) net.edgeIds.push(edge.id);
      collapseWorking(w);
      return asGraph(w);
    }
  }

  if (!srcV && !tgtV) {
    const netId = nid();
    w.nets.set(netId, { id: netId, itemId: edge.itemId, edgeIds: [edge.id] });
    layoutOneToOne(w, src, tgt, netId);
    collapseWorking(w);
    return asGraph(w);
  }

  const existingNetId =
    (srcV && netIdForVertex(w, srcV.id)) ||
    (tgtV && netIdForVertex(w, tgtV.id));
  const netId = existingNetId ?? nid();
  if (!existingNetId) {
    w.nets.set(netId, { id: netId, itemId: edge.itemId, edgeIds: [edge.id] });
  } else {
    const net = w.nets.get(netId);
    if (net && !net.edgeIds.includes(edge.id)) net.edgeIds.push(edge.id);
  }

  if (srcV && !tgtV) {
    if (needsReverseWrap(src.x, tgt.x)) {
      relayoutNet(w, netId, portMap, [src, tgt]);
      collapseWorking(w);
      return asGraph(w);
    }
    const jid = stubJunction(w, srcV.id, true);
    const jDeg = wIncident(w, jid).length;
    if (jDeg >= 3) extendBusAndBranch(w, jid, tgt, netId);
    else routeFromJunctionToPort(w, jid, tgt, netId);
    collapseWorking(w);
    return asGraph(w);
  }

  if (tgtV && !srcV) {
    if (needsReverseWrap(src.x, tgt.x)) {
      relayoutNet(w, netId, portMap, [src, tgt]);
      collapseWorking(w);
      return asGraph(w);
    }
    const jid = stubJunction(w, tgtV.id, false);
    const s = addPortVertex(w, src.portId, src.x, src.y, src.kind);
    const j = w.vertices.get(jid);
    if (j && almostEq(s.y, j.y)) {
      addSegment(w, s.id, j.id, netId, "h");
    } else if (j) {
      const jDeg = wIncident(w, jid).length;
      if (jDeg >= 3) {
        extendBusAndBranch(w, jid, src, netId);
      } else {
        const c = getOrCreateAt(w, j.x, s.y, netId);
        addSegment(w, s.id, c.id, netId, "h");
        addSegment(w, c.id, j.id, netId, "v");
      }
    }
    collapseWorking(w);
    return asGraph(w);
  }

  collapseWorking(w);
  return asGraph(w);
}
