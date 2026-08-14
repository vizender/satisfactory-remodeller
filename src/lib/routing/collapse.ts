import { MIN_SEG } from "./constants";
import { almostEq, dist, hvIntersection } from "./geometry";
import { isPortVertex } from "./nets";
import { hRunHasPort, mergeWouldInwardPort, xIsInward } from "./portStub";
import type { PortKind, RouteGraph, RouteSegment, RouteVertex } from "./types";
import {
  addSegment,
  asGraph,
  refreshKinds,
  removeSegment,
  removeVertex,
  splitSegmentAt,
  toWorking,
  wDegree,
  wIncident,
  type WorkingGraph,
} from "./working";

function mergeVertices(w: WorkingGraph, keepId: string, dropId: string): void {
  if (keepId === dropId) return;
  const keep = w.vertices.get(keepId);
  const drop = w.vertices.get(dropId);
  if (!keep || !drop) return;
  if (drop.portId && !keep.portId) {
    mergeVertices(w, dropId, keepId);
    return;
  }
  for (const s of [...w.segments.values()]) {
    if (s.a === dropId) s.a = keepId;
    if (s.b === dropId) s.b = keepId;
    if (s.a === s.b) w.segments.delete(s.id);
  }
  w.vertices.delete(dropId);
}

function collapseZeroLength(w: WorkingGraph): boolean {
  let changed = false;
  for (const s of [...w.segments.values()]) {
    const a = w.vertices.get(s.a);
    const b = w.vertices.get(s.b);
    if (!a || !b) {
      w.segments.delete(s.id);
      changed = true;
      continue;
    }
    if (dist(a, b) >= MIN_SEG) continue;
    if (s.axis === "v" && mergeWouldInwardPort(w, s.a, s.b)) {
      if (separateIllegalFuse(w, a, b)) changed = true;
      continue;
    }
    mergeVertices(w, s.a, s.b);
    changed = true;
  }
  return changed;
}

/**
 * Keep a min-length V instead of fusing an H into a port (inside the machine).
 * Translates the non-port H-run in Y.
 */
function separateIllegalFuse(
  w: WorkingGraph,
  a: RouteVertex,
  b: RouteVertex,
): boolean {
  const aHas = hRunHasPort(w, a.id);
  const bHas = hRunHasPort(w, b.id);
  const moveStart = aHas && !bHas ? b : bHas && !aHas ? a : isPortVertex(a) ? b : a;
  const stay = moveStart.id === a.id ? b : a;
  if (isPortVertex(moveStart) && isPortVertex(stay)) return false;
  const start = isPortVertex(moveStart) ? stay : moveStart;
  const anchor = start.id === a.id ? b : a;
  const seen = new Set<string>();
  const stack = [start.id];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    const v = w.vertices.get(id);
    if (!v || isPortVertex(v)) continue;
    seen.add(id);
    for (const s of wIncident(w, id)) {
      if (s.axis !== "h") continue;
      const o = s.a === id ? s.b : s.a;
      if (!seen.has(o)) stack.push(o);
    }
  }
  const sample = w.vertices.get(start.id)!;
  const dir = sample.y > anchor.y + 0.5 ? 1 : sample.y < anchor.y - 0.5 ? -1 : 1;
  const nextY = anchor.y + dir * MIN_SEG;
  if (almostEq(sample.y, nextY)) return false;
  for (const id of seen) {
    const v = w.vertices.get(id);
    if (v && !isPortVertex(v)) v.y = nextY;
  }
  return true;
}

function collapseCollinear(w: WorkingGraph): boolean {
  let changed = false;
  for (const v of [...w.vertices.values()]) {
    if (isPortVertex(v)) continue;
    const segs = wIncident(w, v.id);
    if (segs.length !== 2) continue;
    const [s0, s1] = segs;
    if (!s0 || !s1 || s0.axis !== s1.axis || s0.netId !== s1.netId) continue;
    const a = s0.a === v.id ? s0.b : s0.a;
    const b = s1.a === v.id ? s1.b : s1.a;
    if (a === b) continue;
    const va = w.vertices.get(a);
    const vb = w.vertices.get(b);
    if (!va || !vb) continue;
    if (s0.axis === "h" && (!almostEq(va.y, v.y) || !almostEq(vb.y, v.y))) continue;
    if (s0.axis === "v" && (!almostEq(va.x, v.x) || !almostEq(vb.x, v.x))) continue;
    if (s0.axis === "h") {
      const port = isPortVertex(va) ? va : isPortVertex(vb) ? vb : undefined;
      const other = port === va ? vb : va;
      if (port && xIsInward(port, other.x, other.x)) continue;
    }
    removeSegment(w, s0.id);
    removeSegment(w, s1.id);
    addSegment(w, a, b, s0.netId, s0.axis);
    removeVertex(w, v.id);
    changed = true;
  }
  return changed;
}

function dropOrphans(w: WorkingGraph): boolean {
  let changed = false;
  for (const v of [...w.vertices.values()]) {
    const deg = wDegree(w, v.id);
    if (deg === 0) {
      w.vertices.delete(v.id);
      changed = true;
    }
  }
  return changed;
}

function inScope(netId: string, netIds?: Set<string>): boolean {
  return !netIds || netIds.has(netId);
}

function incidentInScope(
  w: WorkingGraph,
  vertexId: string,
  netIds?: Set<string>,
): RouteSegment[] {
  return wIncident(w, vertexId).filter((s) => inScope(s.netId, netIds));
}

/**
 * Delete non-port leaves (open-ended segments) and cascade.
 * A degree-1 corner is never legal; eating it may expose a new leaf.
 */
export function cascadeDegree1(w: WorkingGraph, netIds?: Set<string>): boolean {
  let any = false;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 128) {
    changed = false;
    for (const v of [...w.vertices.values()]) {
      if (isPortVertex(v)) continue;
      const segs = incidentInScope(w, v.id, netIds);
      if (segs.length !== 1) continue;
      if (wDegree(w, v.id) !== 1) continue;
      removeSegment(w, segs[0]!.id);
      removeVertex(w, v.id);
      changed = true;
      any = true;
    }
  }
  return any;
}

function netVertexIds(w: WorkingGraph, netId: string): Set<string> {
  const ids = new Set<string>();
  for (const s of w.segments.values()) {
    if (s.netId !== netId) continue;
    ids.add(s.a);
    ids.add(s.b);
  }
  return ids;
}

function walkComponent(
  w: WorkingGraph,
  startId: string,
  netIds: Set<string> | undefined,
  seen: Set<string>,
): string[] {
  const stack = [startId];
  const comp: string[] = [];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    comp.push(id);
    for (const s of incidentInScope(w, id, netIds)) {
      const o = s.a === id ? s.b : s.a;
      if (!seen.has(o)) stack.push(o);
    }
  }
  return comp;
}

/**
 * Infer in/out from the H stub when `portKind` was never stored. A port with
 * only verticals (synthetic 4SI fixtures) stays unclassified.
 */
function classifyPort(w: WorkingGraph, v: RouteVertex): PortKind | undefined {
  if (v.portKind === "in" || v.portKind === "out") return v.portKind;
  const hs = wIncident(w, v.id).filter((s) => s.axis === "h");
  if (hs.length !== 1) return undefined;
  const farId = hs[0]!.a === v.id ? hs[0]!.b : hs[0]!.a;
  const far = w.vertices.get(farId);
  if (!far || almostEq(far.x, v.x)) return undefined;
  return far.x > v.x ? "out" : "in";
}

/**
 * After a cut, one net record can cover several connected components. Drop any
 * component whose ports are all classified and all the same side (inputs-only
 * or outputs-only). Unclassified ports are left alone so V-only fixtures survive.
 */
function dropOneSidedComponents(
  w: WorkingGraph,
  netIds?: Set<string>,
): boolean {
  let changed = false;
  const seen = new Set<string>();
  const starts: string[] = [];
  if (netIds) {
    for (const s of w.segments.values()) {
      if (!netIds.has(s.netId)) continue;
      starts.push(s.a, s.b);
    }
  } else {
    for (const v of w.vertices.values()) starts.push(v.id);
  }
  for (const start of starts) {
    if (seen.has(start) || !w.vertices.has(start)) continue;
    const comp = walkComponent(w, start, netIds, seen);
    const ports: RouteVertex[] = [];
    for (const id of comp) {
      const v = w.vertices.get(id);
      if (v && isPortVertex(v)) ports.push(v);
    }
    if (ports.length === 0) continue;
    const kinds: PortKind[] = [];
    let unclassified = false;
    for (const p of ports) {
      const k = classifyPort(w, p);
      if (!k) {
        unclassified = true;
        break;
      }
      kinds.push(k);
    }
    if (unclassified) continue;
    const hasIn = kinds.some((k) => k === "in");
    const hasOut = kinds.some((k) => k === "out");
    if (hasIn && hasOut) continue;
    for (const id of comp) {
      for (const s of incidentInScope(w, id, netIds)) {
        w.segments.delete(s.id);
      }
    }
    for (const id of comp) {
      if (wIncident(w, id).length === 0) w.vertices.delete(id);
    }
    changed = true;
  }
  return changed;
}

/** Drop connected components that contain no port (floating rectangles, etc.). */
function dropUnrootedComponents(
  w: WorkingGraph,
  netIds?: Set<string>,
): boolean {
  let changed = false;
  const seen = new Set<string>();
  const starts: string[] = [];
  if (netIds) {
    for (const s of w.segments.values()) {
      if (!netIds.has(s.netId)) continue;
      starts.push(s.a, s.b);
    }
  } else {
    for (const v of w.vertices.values()) starts.push(v.id);
  }
  for (const start of starts) {
    if (seen.has(start) || !w.vertices.has(start)) continue;
    const comp = walkComponent(w, start, netIds, seen);
    const hasPort = comp.some((id) => {
      const v = w.vertices.get(id);
      return v && isPortVertex(v);
    });
    if (hasPort) continue;
    for (const id of comp) {
      for (const s of incidentInScope(w, id, netIds)) {
        w.segments.delete(s.id);
      }
      const v = w.vertices.get(id);
      if (v && !isPortVertex(v)) w.vertices.delete(id);
      changed = true;
    }
  }
  return changed;
}

/**
 * A net with no remaining topology edges is input-only, output-only, or empty.
 * Drop its geometry so a leftover bus cannot survive without both sides.
 */
function dropEmptyNets(w: WorkingGraph, netIds?: Set<string>): boolean {
  let changed = false;
  const dead = new Set<string>();
  for (const [id, net] of w.nets.entries()) {
    if (!inScope(id, netIds)) continue;
    if (net.edgeIds.length === 0) dead.add(id);
  }
  for (const s of w.segments.values()) {
    if (!inScope(s.netId, netIds)) continue;
    if (!w.nets.has(s.netId)) dead.add(s.netId);
  }
  for (const netId of dead) {
    for (const s of [...w.segments.values()]) {
      if (s.netId === netId) w.segments.delete(s.id);
    }
    w.nets.delete(netId);
    changed = true;
  }
  return changed;
}

function portIdsOnNet(w: WorkingGraph, netId: string): string[] {
  const ids: string[] = [];
  for (const id of netVertexIds(w, netId)) {
    const v = w.vertices.get(id);
    if (v && isPortVertex(v)) ids.push(id);
  }
  return ids;
}

function portPartitionKey(
  w: WorkingGraph,
  netId: string,
  skipSegId?: string,
): string {
  const verts = netVertexIds(w, netId);
  const parent = new Map<string, string>();
  for (const id of verts) parent.set(id, id);
  const find = (id: string): string => {
    let cur = parent.get(id) ?? id;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = next;
    }
    return cur;
  };
  const unite = (a: string, b: string) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  };
  for (const s of w.segments.values()) {
    if (s.netId !== netId || s.id === skipSegId) continue;
    if (!verts.has(s.a) || !verts.has(s.b)) continue;
    unite(s.a, s.b);
  }
  const ports = portIdsOnNet(w, netId);
  const groups = new Map<string, string[]>();
  for (const p of ports) {
    const r = find(p);
    const list = groups.get(r) ?? [];
    list.push(p);
    groups.set(r, list);
  }
  return [...groups.values()]
    .map((g) => g.sort().join(","))
    .sort()
    .join("|");
}

/**
 * Remove one same-net edge that does not change port-to-port connectivity.
 * A hanging or floating cycle becomes a dangling chain, then cascadeDegree1
 * eats it. Unique trees (1-to-N buses, kinks) are left alone.
 */
function dropRedundantCycleEdge(
  w: WorkingGraph,
  netIds?: Set<string>,
): boolean {
  const nets = netIds ?? new Set([...w.segments.values()].map((s) => s.netId));
  for (const netId of nets) {
    const ports = portIdsOnNet(w, netId);
    if (ports.length < 1) continue;
    const baseline = portPartitionKey(w, netId);
    let bestId: string | undefined;
    let bestLen = -1;
    for (const s of w.segments.values()) {
      if (s.netId !== netId) continue;
      if (portPartitionKey(w, netId, s.id) !== baseline) continue;
      const a = w.vertices.get(s.a);
      const b = w.vertices.get(s.b);
      const len = a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : 0;
      if (len > bestLen) {
        bestLen = len;
        bestId = s.id;
      }
    }
    if (bestId) {
      w.segments.delete(bestId);
      return true;
    }
  }
  return false;
}

/** Nets that touch the given port vertices. */
export function netIdsTouchingPorts(
  graph: RouteGraph,
  portIds: Iterable<string>,
): string[] {
  const want = new Set(portIds);
  const nets = new Set<string>();
  const vIds = new Set(
    graph.vertices.filter((v) => v.portId && want.has(v.portId)).map((v) => v.id),
  );
  for (const s of graph.segments) {
    if (vIds.has(s.a) || vIds.has(s.b)) nets.add(s.netId);
  }
  return [...nets];
}

/** Collapse dangling ends and unrooted loops, optionally on a subset of nets. */
export function sanitizeRouteGraph(
  graph: RouteGraph,
  netIds?: string[],
): RouteGraph {
  const w = toWorking(graph);
  collapseWorking(w, netIds && netIds.length > 0 ? new Set(netIds) : undefined);
  return asGraph(w);
}

/** Merge overlapping same-net vertices when combined degree ≤ 4. */
function mergeOverlapping(w: WorkingGraph): boolean {
  let changed = false;
  const list = [...w.vertices.values()];
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    if (!w.vertices.has(a.id)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      if (!w.vertices.has(b.id)) continue;
      if (!almostEq(a.x, b.x) || !almostEq(a.y, b.y)) continue;
      const aNets = new Set(wIncident(w, a.id).map((s) => s.netId));
      const bNets = new Set(wIncident(w, b.id).map((s) => s.netId));
      const sameNet = [...aNets].some((n) => bNets.has(n)) || aNets.size === 0 || bNets.size === 0;
      if (!sameNet) continue;
      let connecting = 0;
      for (const s of w.segments.values()) {
        if (
          (s.a === a.id && s.b === b.id) ||
          (s.a === b.id && s.b === a.id)
        ) {
          connecting += 1;
        }
      }
      const combined = wDegree(w, a.id) + wDegree(w, b.id) - connecting;
      if (combined > 4) continue;
      if (mergeWouldInwardPort(w, a.id, b.id)) continue;
      mergeVertices(w, a.id, b.id);
      changed = true;
    }
  }
  return changed;
}

/** Same-net interior H∩V becomes a 4SI. Foreign crossings stay as hops. */
function fuseSameNetCrossings(w: WorkingGraph): boolean {
  const segs = [...w.segments.values()];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!;
      const b = segs[j]!;
      if (a.netId !== b.netId || a.axis === b.axis) continue;
      if (!w.segments.has(a.id) || !w.segments.has(b.id)) continue;
      const h = a.axis === "h" ? a : b;
      const v = a.axis === "v" ? a : b;
      const ha = w.vertices.get(h.a);
      const hb = w.vertices.get(h.b);
      const va = w.vertices.get(v.a);
      const vb = w.vertices.get(v.b);
      if (!ha || !hb || !va || !vb) continue;
      const hit = hvIntersection(ha, hb, va, vb);
      if (!hit) continue;
      const vh = splitSegmentAt(w, h, hit.x, hit.y);
      const vv = splitSegmentAt(w, v, hit.x, hit.y);
      if (vh && vv && vh.id !== vv.id) mergeVertices(w, vh.id, vv.id);
      return true;
    }
  }
  return false;
}

export function collapseGraph(graph: RouteGraph): RouteGraph {
  const w = toWorking(graph);
  collapseWorking(w);
  return asGraph(w);
}

export function collapseWorking(w: WorkingGraph, netIds?: Set<string>): void {
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 64) {
    changed = false;
    if (collapseZeroLength(w)) changed = true;
    if (collapseCollinear(w)) changed = true;
    if (mergeOverlapping(w)) changed = true;
    if (fuseSameNetCrossings(w)) changed = true;
    if (cascadeDegree1(w, netIds)) changed = true;
    if (dropUnrootedComponents(w, netIds)) changed = true;
    if (dropOneSidedComponents(w, netIds)) changed = true;
    if (dropEmptyNets(w, netIds)) changed = true;
    if (dropRedundantCycleEdge(w, netIds)) changed = true;
    if (dropOrphans(w)) changed = true;
  }
  refreshKinds(w);
}
