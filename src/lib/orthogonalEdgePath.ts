import { snapToGrid } from "@/constants/flowGrid";
import type { Edge, Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { getOrthoDragPreview } from "@/lib/orthoDragPreview";
import {
  getEdgeBendX,
  getEdgeCorners,
  getEdgeCornersNorm,
  getLockedVerticals,
  getRouteAnchor,
  type LockedVertical,
  type OrthoNorm,
  type OrthoPoint,
  type RouteAnchor,
} from "@/types/edgeData";

const { PORT_ROW } = MACHINE_LAYOUT;

export const FORWARD_MIN_GAP = 24;
export const BACKWARDS_STUB = 40;
export const BACKWARDS_BUS_OFFSET = 56;
export const VERTICAL_SNAP_ENGAGE = 20;
export const VERTICAL_SNAP_HOLD = 36;
/** Fuse a free vertical onto an intersection when within this distance. */
export const VERTICAL_FUSE_ENGAGE = 20;
/** Keep fused until free remapped vertical separates past this. */
export const VERTICAL_FUSE_HOLD = 36;
/** Generous pad so short kink jogs still snap onto long foreign trunks. */
export const CORNER_SNAP_OVERLAP_PAD = 64;
/** Min length of the horizontal stub leaving/entering a port (keeps line off the machine). */
export const MIN_PORT_STUB = 20;

/** Per-edge free-vertical ordinals currently fused onto a lock (drag session). */
const fuseSession = new Map<string, Set<number>>();
/** Absolute intersection locks snapped at machine-drag start (edgeId → locks). */
const sessionLocksByEdge = new Map<string, LockedVertical[]>();
let fuseSessionActive = false;

function fuseKey(edgeId: string | undefined): string {
  return edgeId ?? "";
}

function mergeLocks(
  base: LockedVertical[],
  overlay: LockedVertical[],
): LockedVertical[] {
  const byOrd = new Map<number, LockedVertical>();
  const orphans: LockedVertical[] = [];
  for (const l of [...base, ...overlay]) {
    if (l.ord >= 0) byOrd.set(l.ord, l);
    else orphans.push(l);
  }
  const out = [...byOrd.values()];
  for (const l of orphans) {
    if (!out.some((x) => Math.abs(x.x - l.x) < 1)) {
      out.push({ x: l.x, ord: -1 });
    }
  }
  return out;
}

/** Locks from edge data plus any snapshot taken at machine-drag start. */
export function effectiveLocks(
  edgeId: string | undefined,
  data: unknown,
): LockedVertical[] {
  const persisted = getLockedVerticals(data);
  if (!edgeId) return persisted;
  const session = sessionLocksByEdge.get(edgeId) ?? [];
  if (session.length === 0) return persisted;
  return mergeLocks(persisted, session);
}

/**
 * Snapshot every current vertical intersection so machine-drag remapping
 * cannot pull shared trunks apart. Also enables same-edge fuse/unfuse memory.
 */
export function beginVerticalFuseSession(edges: Edge[], nodes: Node[]): void {
  fuseSessionActive = true;
  fuseSession.clear();
  sessionLocksByEdge.clear();

  const rawById = new Map<string, OrthoPoint[]>();
  for (const e of edges) {
    const src = portAbsPos(nodes, e.source);
    const tgt = portAbsPos(nodes, e.target);
    if (!src || !tgt) continue;
    rawById.set(
      e.id,
      resolveRoutePointsRaw(src.x, src.y, tgt.x, tgt.y, e.data),
    );
  }

  const edgeNet = buildEdgeNetworkIds(edges);

  for (const [edgeId, points] of rawById) {
    const verts = routeSegments(points).filter(
      (s) => !s.horizontal && s.length >= 4,
    );
    const locks: LockedVertical[] = [];
    const myNet = edgeNet.get(edgeId);
    for (let ord = 0; ord < verts.length; ord++) {
      const s = verts[ord]!;
      const y1 = Math.min(s.a.y, s.b.y);
      const y2 = Math.max(s.a.y, s.b.y);
      let hitX: number | null = null;
      for (const [otherId, otherPts] of rawById) {
        if (otherId === edgeId) continue;
        if (myNet === undefined || edgeNet.get(otherId) !== myNet) continue;
        for (const o of routeSegments(otherPts)) {
          if (o.horizontal || o.length < 4) continue;
          if (Math.abs(s.a.x - o.a.x) > VERTICAL_SNAP_HOLD) continue;
          if (
            !yRangesOverlap(y1, y2, Math.min(o.a.y, o.b.y), Math.max(o.a.y, o.b.y))
          ) {
            continue;
          }
          hitX = snapToGrid((s.a.x + o.a.x) / 2);
          break;
        }
        if (hitX !== null) break;
      }
      if (hitX !== null) locks.push({ x: hitX, ord });
    }
    // Merge with anything already persisted on the edge
    const edge = edges.find((ed) => ed.id === edgeId);
    const merged = mergeLocks(getLockedVerticals(edge?.data), locks);
    if (merged.length > 0) sessionLocksByEdge.set(edgeId, merged);
  }
}

/** Call from machine drag end after committing fused routes. */
export function endVerticalFuseSession(): void {
  fuseSessionActive = false;
  fuseSession.clear();
  sessionLocksByEdge.clear();
}

export function getSessionLocks(edgeId: string): LockedVertical[] {
  return sessionLocksByEdge.get(edgeId) ?? [];
}

const EPS = 0.51;
const MIN_SEG = 16;
const STUB_LEN = 28;
const KINK_JOG = 32;

export function isBackwardsRoute(sourceX: number, targetX: number): boolean {
  return targetX - sourceX < FORWARD_MIN_GAP;
}

export function defaultBendX(sourceX: number, targetX: number): number {
  return snapToGrid((sourceX + targetX) / 2);
}

export function clampBendX(
  bendX: number,
  sourceX: number,
  targetX: number,
  inset = 8,
): number {
  const lo = Math.min(sourceX, targetX) + inset;
  const hi = Math.max(sourceX, targetX) - inset;
  if (hi <= lo) return snapToGrid((sourceX + targetX) / 2);
  return snapToGrid(Math.max(lo, Math.min(hi, bendX)));
}

export function defaultCorners(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): OrthoPoint[] {
  if (!isBackwardsRoute(sourceX, targetX)) {
    const bx = defaultBendX(sourceX, targetX);
    return [
      { x: bx, y: sourceY },
      { x: bx, y: targetY },
    ];
  }
  const outX = snapToGrid(sourceX + BACKWARDS_STUB);
  const inX = snapToGrid(targetX - BACKWARDS_STUB);
  const midY = snapToGrid(Math.max(sourceY, targetY) + BACKWARDS_BUS_OFFSET);
  return [
    { x: outX, y: sourceY },
    { x: outX, y: midY },
    { x: inX, y: midY },
    { x: inX, y: targetY },
  ];
}

function sameX(a: OrthoPoint, b: OrthoPoint): boolean {
  return Math.abs(a.x - b.x) < EPS;
}

function sameY(a: OrthoPoint, b: OrthoPoint): boolean {
  return Math.abs(a.y - b.y) < EPS;
}

function isHorizontalSeg(a: OrthoPoint, b: OrthoPoint): boolean {
  return sameY(a, b) && !sameX(a, b);
}

function isVerticalSeg(a: OrthoPoint, b: OrthoPoint): boolean {
  return sameX(a, b) && !sameY(a, b);
}

/** Collapse zero-length and collinear consecutive points. */
export function simplifyOrthoPoints(points: OrthoPoint[]): OrthoPoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  // Drop zero-length
  let pts: OrthoPoint[] = [{ ...points[0]! }];
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const prev = pts[pts.length - 1]!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < EPS) continue;
    pts.push({ ...p });
  }
  if (pts.length <= 2) return pts;

  const out: OrthoPoint[] = [{ ...pts[0]! }];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const colinearV = sameX(prev, cur) && sameX(cur, next);
    const colinearH = sameY(prev, cur) && sameY(cur, next);
    if (colinearV || colinearH) continue;
    out.push({ ...cur });
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
}

/**
 * Force a strict orthogonal polyline for L/R ports:
 * segments alternate H, V, H, …, H (start/end stubs are horizontal).
 */
export function forceOrthogonal(points: OrthoPoint[]): OrthoPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));

  const start = { ...points[0]! };
  const end = { ...points[points.length - 1]! };

  // Need at least 3-seg: start, bend, end → 2 interiors minimum after expand
  let mids = points.slice(1, -1).map((p) => ({ ...p }));
  if (mids.length < 2) {
    const bx = defaultBendX(start.x, end.x);
    mids = [
      { x: bx, y: start.y },
      { x: bx, y: end.y },
    ];
  }

  // Ensure odd number of segments ⇒ even number of interior points
  // Pattern: H V H V … H  ⇒ interiors: (even count)
  if (mids.length % 2 !== 0) {
    // Duplicate last mid with end.y to close with a vertical then horizontal
    const last = mids[mids.length - 1]!;
    mids.push({ x: last.x, y: end.y });
  }

  // Apply alternating constraints
  // i=0 (first interior): end of first H → same Y as start
  mids[0] = { x: snapToGrid(mids[0]!.x), y: start.y };

  for (let i = 1; i < mids.length; i++) {
    const prev = mids[i - 1]!;
    // Segment before this point: odd i → vertical (same X), even i → horizontal (same Y)
    if (i % 2 === 1) {
      mids[i] = { x: prev.x, y: snapToGrid(mids[i]!.y) };
    } else {
      mids[i] = { x: snapToGrid(mids[i]!.x), y: prev.y };
    }
  }

  // Last interior must end a vertical into the final H stub → same Y as end, same X as prev vertical
  const lastIdx = mids.length - 1;
  if (lastIdx % 2 === 1) {
    // last mid ends a V — set y to end.y
    mids[lastIdx] = { x: mids[lastIdx]!.x, y: end.y };
  } else {
    // shouldn't happen if even count; fix
    mids[lastIdx] = { x: mids[lastIdx]!.x, y: end.y };
  }

  return simplifyOrthoPoints([start, ...mids, end]);
}

export function ensureOrthogonal(points: OrthoPoint[]): OrthoPoint[] {
  return forceOrthogonal(points);
}

function safeDiv(num: number, den: number, fallback: number): number {
  return Math.abs(den) < 1e-6 ? fallback : num / den;
}

/** Absolute point → fraction of the source→target box. */
export function pointToNorm(
  p: OrthoPoint,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): OrthoNorm {
  return {
    u: safeDiv(p.x - sx, tx - sx, 0.5),
    v: safeDiv(p.y - sy, ty - sy, 0.5),
  };
}

/** Fraction → absolute point in the live source→target box. */
export function normToPoint(
  n: OrthoNorm,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): OrthoPoint {
  return {
    x: sx + n.u * (tx - sx),
    y: sy + n.v * (ty - sy),
  };
}

export function pointsToNorms(
  points: OrthoPoint[],
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): OrthoNorm[] {
  return interiorCorners(points).map((p) => pointToNorm(p, sx, sy, tx, ty));
}

export function normsToCorners(
  norms: OrthoNorm[],
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): OrthoPoint[] {
  return norms.map((n) => normToPoint(n, sx, sy, tx, ty));
}

/**
 * Remap absolute corners that were authored against `anchor` into the live box.
 * If no anchor, treat current endpoints as the authoring box (one-shot migration).
 */
function remapAbsoluteCorners(
  corners: OrthoPoint[],
  live: RouteAnchor,
  anchor: RouteAnchor | undefined,
): OrthoPoint[] {
  const a = anchor ?? live;
  return corners.map((c) => {
    const n = pointToNorm(c, a.sx, a.sy, a.tx, a.ty);
    return normToPoint(n, live.sx, live.sy, live.tx, live.ty);
  });
}

export function resolveRoutePoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  data: unknown,
  edgeId?: string,
): OrthoPoint[] {
  let points = resolveRoutePointsRaw(sourceX, sourceY, targetX, targetY, data);
  // Stub clamp first — intersection locks must win afterward so a machine
  // dragged close to a trunk cannot shove the shared vertical away.
  points = clampPortStubs(points);
  points = applyLockedVerticalXs(
    points,
    effectiveLocks(edgeId, data),
    edgeId,
  );
  return points;
}

function pinVerticalAt(
  pts: OrthoPoint[],
  segIndex: number,
  x: number,
): void {
  if (!pts[segIndex] || !pts[segIndex + 1]) return;
  pts[segIndex] = { x, y: pts[segIndex]!.y };
  pts[segIndex + 1] = { x, y: pts[segIndex + 1]!.y };
}

function resolveLockOrdinals(
  verts: { index: number; a: OrthoPoint; b: OrthoPoint }[],
  locks: LockedVertical[],
): LockedVertical[] {
  const used = new Set<number>();
  const out: LockedVertical[] = [];
  for (const lock of locks) {
    if (lock.ord >= 0 && lock.ord < verts.length && !used.has(lock.ord)) {
      used.add(lock.ord);
      out.push({ x: lock.x, ord: lock.ord });
      continue;
    }
    // Legacy / missing ord: nearest unused vertical
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < verts.length; i++) {
      if (used.has(i)) continue;
      const d = Math.abs(verts[i]!.a.x - lock.x);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;
    used.add(bestIdx);
    out.push({ x: lock.x, ord: bestIdx });
  }
  return out;
}

/**
 * Pin locked intersection verticals by ordinal, then fuse any free vertical
 * that has remapped close to a lock onto that absolute X. Collapsing is
 * temporary while norms still describe the unfused kink — separating again
 * restores both verticals until the fuse is committed on drag end.
 */
export function applyLockedVerticalXs(
  points: OrthoPoint[],
  locks: LockedVertical[],
  edgeId?: string,
): OrthoPoint[] {
  if (locks.length === 0 || points.length < 3) return points;
  const pts = points.map((p) => ({ ...p }));
  const segs = routeSegments(pts).filter((s) => !s.horizontal);
  if (segs.length === 0) return points;

  const verts = segs.map((s) => ({ index: s.index, a: s.a, b: s.b }));
  const resolved = resolveLockOrdinals(verts, locks);
  const lockedOrds = new Set(resolved.map((l) => l.ord));
  const key = fuseKey(edgeId);
  const held =
    fuseSessionActive && key
      ? (fuseSession.get(key) ?? new Set<number>())
      : null;
  const nextHeld = new Set<number>();

  for (const lock of resolved) {
    const v = verts[lock.ord];
    if (!v) continue;
    pinVerticalAt(pts, v.index, lock.x);
  }

  // Fuse only while a machine drag session is active — norms keep the kink
  // as short-term memory until commitFusedOrthogonalEdges on drag end.
  if (fuseSessionActive) {
    for (let i = 0; i < verts.length; i++) {
      if (lockedOrds.has(i)) continue;
      const v = verts[i]!;
      let fuseTo: number | null = null;
      let best = Infinity;
      for (const lock of resolved) {
        const d = Math.abs(v.a.x - lock.x);
        if (d < best) {
          best = d;
          fuseTo = lock.x;
        }
      }
      if (fuseTo === null) continue;
      const wasHeld = held?.has(i) ?? false;
      const threshold = wasHeld ? VERTICAL_FUSE_HOLD : VERTICAL_FUSE_ENGAGE;
      if (best <= threshold) {
        pinVerticalAt(pts, v.index, fuseTo);
        nextHeld.add(i);
      }
    }

    if (held && key) {
      if (nextHeld.size > 0) fuseSession.set(key, nextHeld);
      else fuseSession.delete(key);
    }
  }

  return forceOrthogonal(pts);
}

/** True when at least one free vertical sits within fuse range of a lock. */
export function hasFusableVerticals(
  points: OrthoPoint[],
  locks: LockedVertical[],
): boolean {
  if (locks.length === 0) return false;
  const verts = routeSegments(points).filter((s) => !s.horizontal);
  if (verts.length < 2) return false;
  const resolved = resolveLockOrdinals(
    verts.map((s) => ({ index: s.index, a: s.a, b: s.b })),
    locks,
  );
  const lockedOrds = new Set(resolved.map((l) => l.ord));
  for (let i = 0; i < verts.length; i++) {
    if (lockedOrds.has(i)) continue;
    for (const lock of resolved) {
      if (Math.abs(verts[i]!.a.x - lock.x) <= VERTICAL_FUSE_HOLD) return true;
    }
  }
  return false;
}

/**
 * After a machine drag ends while verticals are fused, write the simplified
 * geometry so the forgotten kink does not spring back. Always persist
 * session intersection locks so trunks stay fixed on the next drag.
 */
export function commitFusedOrthogonalEdges(
  edges: Edge[],
  nodes: Node[],
  setEdgeCorners: (
    edgeId: string,
    corners: OrthoPoint[],
    anchor: RouteAnchor,
    locks: LockedVertical[],
  ) => void,
): void {
  for (const edge of edges) {
    const locks = effectiveLocks(edge.id, edge.data);
    if (locks.length === 0) continue;
    const src = portAbsPos(nodes, edge.source);
    const tgt = portAbsPos(nodes, edge.target);
    if (!src || !tgt) continue;

    const raw = resolveRoutePointsRaw(src.x, src.y, tgt.x, tgt.y, edge.data);
    const points = applyLockedVerticalXs(
      clampPortStubs(raw),
      locks,
      edge.id,
    );

    const outVerts = routeSegments(points).filter((s) => !s.horizontal);
    const nextLocks = resolveLockOrdinals(
      outVerts.map((s) => ({ index: s.index, a: s.a, b: s.b })),
      locks.map((l) => ({ x: l.x, ord: -1 })),
    );

    setEdgeCorners(
      edge.id,
      interiorCorners(points),
      { sx: src.x, sy: src.y, tx: tgt.x, ty: tgt.y },
      nextLocks,
    );
  }
}

/** Resolve corners from data without applying locks/fuse/stub clamps. */
export function resolveRoutePointsRaw(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  data: unknown,
): OrthoPoint[] {
  const live: RouteAnchor = {
    sx: sourceX,
    sy: sourceY,
    tx: targetX,
    ty: targetY,
  };
  const norms = getEdgeCornersNorm(data);
  const stored = getEdgeCorners(data);
  const bendX = getEdgeBendX(data);
  const anchor = getRouteAnchor(data);
  let corners: OrthoPoint[];

  if (norms && norms.length >= 2) {
    corners = normsToCorners(norms, sourceX, sourceY, targetX, targetY);
    if (isBackwardsRoute(sourceX, targetX) && corners.length < 4) {
      corners = defaultCorners(sourceX, sourceY, targetX, targetY);
    }
  } else if (stored && stored.length >= 2) {
    corners = remapAbsoluteCorners(stored, live, anchor);
    if (isBackwardsRoute(sourceX, targetX) && corners.length < 4) {
      corners = defaultCorners(sourceX, sourceY, targetX, targetY);
    }
  } else if (bendX !== undefined) {
    if (isBackwardsRoute(sourceX, targetX)) {
      corners = defaultCorners(sourceX, sourceY, targetX, targetY);
    } else {
      const a = anchor ?? live;
      const u = safeDiv(bendX - a.sx, a.tx - a.sx, 0.5);
      const bx = sourceX + u * (targetX - sourceX);
      corners = [
        { x: bx, y: sourceY },
        { x: bx, y: targetY },
      ];
    }
  } else {
    corners = defaultCorners(sourceX, sourceY, targetX, targetY);
  }

  return forceOrthogonal([
    { x: sourceX, y: sourceY },
    ...corners,
    { x: targetX, y: targetY },
  ]);
}

/**
 * Enforce a minimum horizontal stub at source (exit right) and target (enter left)
 * so the route never draws over the machine body.
 */
export function clampPortStubs(points: OrthoPoint[]): OrthoPoint[] {
  if (points.length < 3) return points;
  const pts = points.map((p) => ({ ...p }));
  const start = pts[0]!;
  const end = pts[pts.length - 1]!;

  // Vertical buses / same-X segment ends (shared routing) have no L→R port stubs.
  if (Math.abs(end.x - start.x) < 1) {
    return forceOrthogonal(pts);
  }

  // Source stub end (pts[1]): keep to the right of the output handle
  const minSourceX = start.x + MIN_PORT_STUB;
  if (pts[1]!.x < minSourceX) {
    const dx = minSourceX - pts[1]!.x;
    pts[1] = { x: minSourceX, y: start.y };
    // Shift the following vertical (same former x) if present
    if (pts.length > 2 && Math.abs(pts[2]!.x - (minSourceX - dx)) < EPS + 1) {
      pts[2] = { x: minSourceX, y: pts[2]!.y };
    }
  }

  // Target stub start (pts[n-2]): keep to the left of the input handle
  const lastInt = pts.length - 2;
  const maxTargetX = end.x - MIN_PORT_STUB;
  if (pts[lastInt]!.x > maxTargetX) {
    const oldX = pts[lastInt]!.x;
    pts[lastInt] = { x: maxTargetX, y: end.y };
    if (lastInt > 0 && Math.abs(pts[lastInt - 1]!.x - oldX) < EPS + 1) {
      pts[lastInt - 1] = { x: maxTargetX, y: pts[lastInt - 1]!.y };
    }
  }

  return forceOrthogonal(pts);
}

/** Collect locked verticals that should stay fixed for this edge given all edges. */
export function detectIntersectionLocks(
  edgeId: string,
  points: OrthoPoint[],
  edges: Edge[],
  nodes: Node[],
): LockedVertical[] {
  const locks: LockedVertical[] = [];
  const mine = routeSegments(points).filter((s) => !s.horizontal && s.length >= 4);
  const others = collectVerticalSegments(edges, nodes, edgeId, {
    sameNetworkAs: edgeId,
  });
  let vertOrd = -1;
  const allVerts = routeSegments(points).filter((s) => !s.horizontal);
  for (const s of mine) {
    vertOrd = allVerts.findIndex((v) => v.index === s.index);
    for (const o of others) {
      if (Math.abs(s.a.x - o.x) > VERTICAL_SNAP_ENGAGE) continue;
      if (
        !yRangesOverlap(
          Math.min(s.a.y, s.b.y),
          Math.max(s.a.y, s.b.y),
          o.y1,
          o.y2,
        )
      ) {
        continue;
      }
      locks.push({
        x: snapToGrid((s.a.x + o.x) / 2),
        ord: vertOrd >= 0 ? vertOrd : 0,
      });
      break;
    }
  }
  // Unique by ordinal (one lock per vertical)
  const out: LockedVertical[] = [];
  for (const lock of locks) {
    if (out.some((y) => y.ord === lock.ord)) continue;
    out.push(lock);
  }
  return out;
}

function locksEqual(a: LockedVertical[], b: LockedVertical[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.ord - y.ord || x.x - y.x);
  const sb = [...b].sort((x, y) => x.ord - y.ord || x.x - y.x);
  return sa.every(
    (x, i) => sb[i]!.ord === x.ord && Math.abs(x.x - sb[i]!.x) < 1,
  );
}

/**
 * Recompute intersection locks for edges that currently intersect `edgeId`
 * (or already carry locks), so partners stay pinned / clear when pulled apart.
 */
export function partnerIdsNeedingLockRefresh(
  edgeId: string,
  points: OrthoPoint[],
  edges: Edge[],
  nodes: Node[],
): string[] {
  const ids = new Set<string>();
  const mine = routeSegments(points).filter((s) => !s.horizontal && s.length >= 4);
  for (const o of collectVerticalSegments(edges, nodes, edgeId, {
    sameNetworkAs: edgeId,
  })) {
    for (const s of mine) {
      if (Math.abs(s.a.x - o.x) > VERTICAL_SNAP_HOLD) continue;
      if (
        !yRangesOverlap(
          Math.min(s.a.y, s.b.y),
          Math.max(s.a.y, s.b.y),
          o.y1,
          o.y2,
        )
      ) {
        continue;
      }
      ids.add(o.edgeId);
    }
  }
  for (const e of edges) {
    if (e.id === edgeId) continue;
    if (getLockedVerticals(e.data).length > 0) ids.add(e.id);
  }
  return [...ids];
}

export function resolveEdgeRouteFromNodes(
  edge: Edge,
  nodes: Node[],
): { points: OrthoPoint[]; anchor: RouteAnchor } | null {
  const src = portAbsPos(nodes, edge.source);
  const tgt = portAbsPos(nodes, edge.target);
  if (!src || !tgt) return null;
  return {
    points: resolveRoutePoints(src.x, src.y, tgt.x, tgt.y, edge.data, edge.id),
    anchor: { sx: src.x, sy: src.y, tx: tgt.x, ty: tgt.y },
  };
}

export function locksChanged(
  prev: LockedVertical[],
  next: LockedVertical[],
): boolean {
  return !locksEqual(prev, next);
}

export function pointsToSvgPath(points: OrthoPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x},${first!.y}`;
  for (const p of rest) d += ` L ${p.x},${p.y}`;
  return d;
}

export function buildOrthogonalPathFromData(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  data: unknown,
): string {
  return pointsToSvgPath(
    resolveRoutePoints(sourceX, sourceY, targetX, targetY, data),
  );
}

export function buildOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  bendX: number,
): string {
  return pointsToSvgPath(
    resolveRoutePoints(sourceX, sourceY, targetX, targetY, {
      itemId: "",
      bendX,
    }),
  );
}

export function resolveBendX(
  sourceX: number,
  targetX: number,
  bendX: number | undefined,
): number {
  const raw =
    bendX !== undefined && Number.isFinite(bendX)
      ? bendX
      : defaultBendX(sourceX, targetX);
  return clampBendX(raw, sourceX, targetX);
}

export type OrthoSegment = {
  index: number;
  a: OrthoPoint;
  b: OrthoPoint;
  horizontal: boolean;
  isStub: boolean;
  midX: number;
  midY: number;
  length: number;
};

export function routeSegments(points: OrthoPoint[]): OrthoSegment[] {
  const segs: OrthoSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const horizontal = isHorizontalSeg(a, b) || (!isVerticalSeg(a, b) && sameY(a, b));
    segs.push({
      index: i,
      a,
      b,
      horizontal: horizontal || (!isVerticalSeg(a, b) && Math.abs(a.y - b.y) <= Math.abs(a.x - b.x)),
      isStub: i === 0 || i === points.length - 2,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      length: Math.hypot(b.x - a.x, b.y - a.y),
    });
  }
  // Normalize orientation strictly after forceOrthogonal
  return segs.map((s) => ({
    ...s,
    horizontal: isHorizontalSeg(s.a, s.b) || (sameY(s.a, s.b) && !isVerticalSeg(s.a, s.b)),
  }));
}

export function orthogonalLabelPosition(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  data: unknown,
): { x: number; y: number } {
  const pts = resolveRoutePoints(sourceX, sourceY, targetX, targetY, data);
  if (pts.length < 2) {
    return { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
  }
  const mid = Math.floor((pts.length - 1) / 2);
  const a = pts[mid]!;
  const b = pts[mid + 1]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function interiorCorners(points: OrthoPoint[]): OrthoPoint[] {
  if (points.length <= 2) return [];
  return points.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
}

export function minInteriorCorners(sourceX: number, targetX: number): number {
  return isBackwardsRoute(sourceX, targetX) ? 4 : 2;
}

export type MoveSegmentResult = {
  points: OrthoPoint[];
  /** Segment index to keep dragging after a stub→kink expansion. */
  activeSegmentIndex: number;
};

/** Loose axis match for open stubs (junction Y can drift a few px from port row). */
const OPEN_AXIS_EPS = 8;

/**
 * Clamp interior corners so they don't overshoot past axis-aligned endpoints
 * (the classic "excroissance" past a T-junction).
 * - Near-same-Y ends: keep every corner X inside [minX, maxX]
 * - Near-same-X ends: keep every corner Y inside [minY, maxY]
 */
export function clampOpenCorners(
  start: OrthoPoint,
  corners: OrthoPoint[],
  end: OrthoPoint,
): OrthoPoint[] {
  if (corners.length === 0) return [];
  if (Math.abs(start.y - end.y) <= OPEN_AXIS_EPS) {
    const lo = Math.min(start.x, end.x);
    const hi = Math.max(start.x, end.x);
    const y = (start.y + end.y) / 2;
    return corners.map((p) => ({
      x: snapToGrid(Math.max(lo, Math.min(hi, p.x))),
      // Keep free-axis motion; only pin X into the stub span
      y: Math.abs(p.y - y) <= OPEN_AXIS_EPS ? snapToGrid(y) : p.y,
    }));
  }
  if (Math.abs(start.x - end.x) <= OPEN_AXIS_EPS) {
    const lo = Math.min(start.y, end.y);
    const hi = Math.max(start.y, end.y);
    const x = (start.x + end.x) / 2;
    return corners.map((p) => ({
      x: Math.abs(p.x - x) <= OPEN_AXIS_EPS ? snapToGrid(x) : p.x,
      y: snapToGrid(Math.max(lo, Math.min(hi, p.y))),
    }));
  }
  return corners.map((p) => ({ ...p }));
}

/**
 * Assemble an open orthogonal polyline from fixed endpoints + absolute corners.
 * Unlike forceOrthogonal, does not assume port→port H–V–H — no stub tails.
 */
export function assembleOpenPolyline(
  start: OrthoPoint,
  corners: OrthoPoint[],
  end: OrthoPoint,
): OrthoPoint[] {
  const clamped = clampOpenCorners(start, corners, end);
  const raw: OrthoPoint[] = [
    { ...start },
    ...clamped.map((p) => ({ x: p.x, y: p.y })),
    { ...end },
  ];
  const pts: OrthoPoint[] = [{ ...raw[0]! }];
  for (let i = 1; i < raw.length; i++) {
    const prev = pts[pts.length - 1]!;
    const cur = raw[i]!;
    if (sameX(prev, cur) || sameY(prev, cur)) {
      pts.push({ ...cur });
      continue;
    }
    // Insert one bend — keep prior run axis when obvious, else H then V
    const prevWasH =
      pts.length >= 2 && sameY(pts[pts.length - 2]!, prev);
    if (prevWasH) {
      pts.push({ x: prev.x, y: snapToGrid(cur.y) });
    } else {
      pts.push({ x: snapToGrid(cur.x), y: prev.y });
    }
    pts.push({ ...cur });
  }
  pts[0] = { ...start };
  pts[pts.length - 1] = { ...end };
  // Re-clamp after bend insertion so closing jogs can't overshoot
  const simplified = simplifyOrthoPoints(pts);
  if (simplified.length <= 2) return simplified;
  const mid = clampOpenCorners(
    simplified[0]!,
    simplified.slice(1, -1),
    simplified[simplified.length - 1]!,
  );
  return simplifyOrthoPoints([
    { ...simplified[0]! },
    ...mid,
    { ...simplified[simplified.length - 1]! },
  ]);
}

/**
 * Orthogonalize an open polyline without assuming port→port H–V–H stubs.
 * Preserves endpoints; used for shared routing segments (stubs, buses, kinks).
 */
export function orthogonalizeOpen(points: OrthoPoint[]): OrthoPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const start = { ...points[0]! };
  const end = { ...points[points.length - 1]! };
  if (points.length === 2) {
    return assembleOpenPolyline(start, [], end);
  }
  return assembleOpenPolyline(start, points.slice(1, -1), end);
}

/**
 * Move an interior corner on an open orthogonal chain (no port-stub clamps).
 * Endpoints stay fixed — critical for routing stubs attached to ports.
 */
export function moveCorner2DOpen(
  points: OrthoPoint[],
  cornerIndex: number,
  x: number,
  y: number,
): OrthoPoint[] {
  if (cornerIndex <= 0 || cornerIndex >= points.length - 1) {
    return orthogonalizeOpen(points);
  }
  const start = { ...points[0]! };
  const end = { ...points[points.length - 1]! };
  const pts = points.map((p) => ({ ...p }));
  const nx = snapToGrid(x);
  const ny = snapToGrid(y);
  const prev = pts[cornerIndex - 1]!;
  const next = pts[cornerIndex + 1]!;
  const wasH =
    Math.abs(prev.y - pts[cornerIndex]!.y) <=
    Math.abs(prev.x - pts[cornerIndex]!.x) + EPS;

  if (wasH) {
    pts[cornerIndex] = { x: nx, y: prev.y };
    if (cornerIndex + 1 < pts.length - 1) {
      // Keep the following vertical on the new X
      pts[cornerIndex + 1] = { x: nx, y: next.y };
    } else {
      // Next is endpoint: insert a jog so we don't drag the port/junction
      pts.splice(cornerIndex + 1, 0, { x: nx, y: end.y });
    }
  } else {
    pts[cornerIndex] = { x: prev.x, y: ny };
    if (cornerIndex + 1 < pts.length - 1) {
      pts[cornerIndex + 1] = { x: next.x, y: ny };
    } else {
      pts.splice(cornerIndex + 1, 0, { x: end.x, y: ny });
    }
  }

  // Never move pinned endpoints — local simplify only (avoids reshape stutter)
  pts[0] = start;
  pts[pts.length - 1] = end;
  return simplifyOrthoPoints(pts);
}

/** Which endpoint is the port attachment on a shared stub (pin that side). */
export type OpenKinkPin = "start" | "end" | "both";

/**
 * Drag a segment on an open chain. Endpoints stay fixed — edits are local to
 * this segment so connected stubs/buses are not rewritten.
 * - Straight 2-point runs get a U-offset (parallel free run) instead of moving junctions.
 * - Port stubs use `pin` so mid-handle kinks face the junction.
 */
export function moveSegmentOpen(
  segmentIndex: number,
  pointerFlow: { x: number; y: number },
  startPoints: OrthoPoint[],
  startPointer: { x: number; y: number },
  options?: {
    /** @deprecated Junction translation removed — kept for call-site compat. */
    translateStraight?: boolean;
    /** Pin the port side so the kink's free run faces the junction. */
    pin?: OpenKinkPin;
  },
): MoveSegmentResult {
  const base = orthogonalizeOpen(startPoints);
  const segs = routeSegments(base);
  const seg = segs[segmentIndex] ?? segs[0];
  if (!seg) return { points: base, activeSegmentIndex: 0 };
  const pin = options?.pin ?? "both";

  // Junction↔junction rails/wrap: translate the whole run (caller persists
  // junction moves). Port stubs still U-bend with pinned endpoints.
  if (base.length === 2 && options?.translateStraight) {
    if (seg.horizontal) {
      const newY = snapToGrid(seg.a.y + (pointerFlow.y - startPointer.y));
      return {
        points: [
          { x: base[0]!.x, y: newY },
          { x: base[1]!.x, y: newY },
        ],
        activeSegmentIndex: 0,
      };
    }
    const newX = snapToGrid(seg.a.x + (pointerFlow.x - startPointer.x));
    return {
      points: [
        { x: newX, y: base[0]!.y },
        { x: newX, y: base[1]!.y },
      ],
      activeSegmentIndex: 0,
    };
  }

  // Straight port stub: offset with a U-bend, endpoints pinned.
  if (base.length === 2) {
    if (seg.horizontal) {
      const newY = snapToGrid(seg.a.y + (pointerFlow.y - startPointer.y));
      if (Math.abs(newY - seg.a.y) < MIN_SEG / 2) {
        return { points: base, activeSegmentIndex: 0 };
      }
      const pts = simplifyOrthoPoints([
        { ...base[0]! },
        { x: base[0]!.x, y: newY },
        { x: base[1]!.x, y: newY },
        { ...base[1]! },
      ]);
      return { points: pts, activeSegmentIndex: Math.min(1, pts.length - 3) };
    }
    const newX = snapToGrid(seg.a.x + (pointerFlow.x - startPointer.x));
    if (Math.abs(newX - seg.a.x) < MIN_SEG / 2) {
      return { points: base, activeSegmentIndex: 0 };
    }
    const pts = simplifyOrthoPoints([
      { ...base[0]! },
      { x: newX, y: base[0]!.y },
      { x: newX, y: base[1]!.y },
      { ...base[1]! },
    ]);
    return { points: pts, activeSegmentIndex: Math.min(1, pts.length - 3) };
  }

  if (seg.horizontal) {
    const newY = snapToGrid(seg.a.y + (pointerFlow.y - startPointer.y));
    if (segmentIndex === 0 || segmentIndex === base.length - 2) {
      // Endpoint-adjacent H: expand a U toward the interior, keep port/junction fixed
      const kinked = beginMidHandleKink(
        base,
        segmentIndex,
        { x: (seg.a.x + seg.b.x) / 2, y: newY },
        pin,
      );
      if (kinked.cornerIndex < 0) {
        return { points: base, activeSegmentIndex: segmentIndex };
      }
      const moved = moveCorner2DOpen(
        kinked.points,
        kinked.cornerIndex,
        pointerFlow.x,
        newY,
      );
      return {
        points: moved,
        activeSegmentIndex: Math.min(kinked.cornerIndex, moved.length - 3),
      };
    }
    const pts = base.map((p) => ({ ...p }));
    pts[segmentIndex] = { x: pts[segmentIndex]!.x, y: newY };
    pts[segmentIndex + 1] = { x: pts[segmentIndex + 1]!.x, y: newY };
    pts[0] = { ...base[0]! };
    pts[pts.length - 1] = { ...base[base.length - 1]! };
    return {
      points: simplifyOrthoPoints(pts),
      activeSegmentIndex: segmentIndex,
    };
  }

  const newX = snapToGrid(seg.a.x + (pointerFlow.x - startPointer.x));
  if (segmentIndex === 0 || segmentIndex === base.length - 2) {
    const kinked = beginMidHandleKink(
      base,
      segmentIndex,
      { x: newX, y: (seg.a.y + seg.b.y) / 2 },
      pin,
    );
    if (kinked.cornerIndex < 0) {
      return { points: base, activeSegmentIndex: segmentIndex };
    }
    const moved = moveCorner2DOpen(
      kinked.points,
      kinked.cornerIndex,
      newX,
      pointerFlow.y,
    );
    return {
      points: moved,
      activeSegmentIndex: Math.min(kinked.cornerIndex, moved.length - 3),
    };
  }
  const pts = base.map((p) => ({ ...p }));
  pts[segmentIndex] = { x: newX, y: pts[segmentIndex]!.y };
  pts[segmentIndex + 1] = { x: newX, y: pts[segmentIndex + 1]!.y };
  pts[0] = { ...base[0]! };
  pts[pts.length - 1] = { ...base[base.length - 1]! };
  return {
    points: simplifyOrthoPoints(pts),
    activeSegmentIndex: segmentIndex,
  };
}


/**
 * Drag segment perpendicular to its axis.
 * - Free H: move Y only (H stays H; adjacent V grow/shrink)
 * - Free V: move X only
 * - Stub H: expand to H+V+H once, then move the new free H
 * - Stub V: expand to V+H+V once, then move the new free V
 */
export function moveSegment(
  _currentPoints: OrthoPoint[],
  segmentIndex: number,
  pointerFlow: { x: number; y: number },
  startPoints: OrthoPoint[],
  startPointer: { x: number; y: number },
): MoveSegmentResult {
  const base = forceOrthogonal(startPoints);
  const segs = routeSegments(base);
  const seg = segs[segmentIndex] ?? segs[0];
  if (!seg) return { points: base, activeSegmentIndex: 0 };

  // Single-segment polylines (shared routing stub/bus): kink at the pointer
  // instead of port-stub expansion which parks the jog at the extremity.
  if (base.length === 2) {
    const kinked = beginMidHandleKink(base, 0, pointerFlow);
    if (kinked.cornerIndex < 0) {
      return { points: base, activeSegmentIndex: 0 };
    }
    const moved = moveCorner2D(
      kinked.points,
      kinked.cornerIndex,
      pointerFlow.x,
      pointerFlow.y,
    );
    const freeSegs = routeSegments(moved).filter((s) => !s.isStub && s.length >= 4);
    const active =
      freeSegs.find((s) =>
        seg.horizontal ? s.horizontal : !s.horizontal,
      )?.index ?? Math.min(1, Math.max(0, moved.length - 3));
    return { points: moved, activeSegmentIndex: active };
  }

  if (seg.horizontal) {
    const newY = snapToGrid(seg.a.y + (pointerFlow.y - startPointer.y));
    if (seg.isStub) {
      return expandStubHorizontalAndMove(base, segmentIndex, newY);
    }
    return {
      points: moveFreeHorizontal(base, segmentIndex, newY),
      activeSegmentIndex: segmentIndex,
    };
  }

  const newX = snapToGrid(seg.a.x + (pointerFlow.x - startPointer.x));
  if (seg.isStub) {
    return expandStubVerticalAndMove(base, segmentIndex, newX);
  }
  return {
    points: moveFreeVertical(base, segmentIndex, newX),
    activeSegmentIndex: segmentIndex,
  };
}

function moveFreeHorizontal(
  points: OrthoPoint[],
  segmentIndex: number,
  newY: number,
): OrthoPoint[] {
  const pts = points.map((p) => ({ ...p }));
  // Don't move fixed endpoints
  if (segmentIndex === 0 || segmentIndex === pts.length - 2) {
    return clampPortStubs(forceOrthogonal(pts));
  }
  pts[segmentIndex] = { x: pts[segmentIndex]!.x, y: newY };
  pts[segmentIndex + 1] = { x: pts[segmentIndex + 1]!.x, y: newY };
  pts[0] = { ...points[0]! };
  pts[pts.length - 1] = { ...points[points.length - 1]! };
  return clampPortStubs(forceOrthogonal(pts));
}

function moveFreeVertical(
  points: OrthoPoint[],
  segmentIndex: number,
  newX: number,
): OrthoPoint[] {
  const pts = points.map((p) => ({ ...p }));
  const sx = points[0]!.x;
  const tx = points[points.length - 1]!.x;
  // Keep verticals from crossing into machine bodies past the port stubs.
  // Source exits to the right; target enters from the left (even on backwards routes).
  let x = newX;
  if (segmentIndex <= 1) {
    x = Math.max(x, sx + MIN_PORT_STUB);
  }
  if (segmentIndex >= points.length - 3) {
    x = Math.min(x, tx - MIN_PORT_STUB);
  }

  pts[segmentIndex] = { x, y: pts[segmentIndex]!.y };
  pts[segmentIndex + 1] = { x, y: pts[segmentIndex + 1]!.y };
  pts[0] = { ...points[0]! };
  pts[pts.length - 1] = { ...points[points.length - 1]! };
  return clampPortStubs(forceOrthogonal(pts));
}

/** Source/target horizontal stub → H + V + H, then move the new free H to newY. */
function expandStubHorizontalAndMove(
  points: OrthoPoint[],
  segmentIndex: number,
  newY: number,
): MoveSegmentResult {
  const pts = points.map((p) => ({ ...p }));
  const start = pts[0]!;
  const end = pts[pts.length - 1]!;

  if (segmentIndex === 0) {
    // (sx,sy)-(x1,sy)-…  →  (sx,sy)-(exit,sy)-(exit,newY)-(x1,newY)-…
    const x1 = pts[1]!.x;
    const dir = Math.sign(x1 - start.x) || 1;
    const exitX = snapToGrid(start.x + dir * Math.max(STUB_LEN, MIN_PORT_STUB));
    const y = snapToGrid(newY);
    // Avoid collapsing: keep |y - sy| meaningful
    const finalY =
      Math.abs(y - start.y) < MIN_SEG
        ? snapToGrid(start.y + Math.sign(y - start.y || 1) * MIN_SEG)
        : y;

    const rest = pts.slice(2); // after old first interior
    const next: OrthoPoint[] = [
      { ...start },
      { x: exitX, y: start.y },
      { x: exitX, y: finalY },
      { x: x1, y: finalY },
      ...rest,
    ];
    const forced = forceOrthogonal(next);
    // Active segment is the new free horizontal at finalY (index 2)
    return { points: forced, activeSegmentIndex: 2 };
  }

  // Target stub (last segment)
  const last = pts.length - 1;
  const prev = pts[last - 1]!;
  const dir = Math.sign(prev.x - end.x) || -1;
  const exitX = snapToGrid(end.x + dir * Math.max(STUB_LEN, MIN_PORT_STUB));
  const y = snapToGrid(newY);
  const finalY =
    Math.abs(y - end.y) < MIN_SEG
      ? snapToGrid(end.y + Math.sign(y - end.y || -1) * MIN_SEG)
      : y;

  const head = pts.slice(0, -2);
  const next: OrthoPoint[] = [
    ...head,
    { x: prev.x, y: finalY },
    { x: exitX, y: finalY },
    { x: exitX, y: end.y },
    { ...end },
  ];
  const forced = forceOrthogonal(next);
  // Free horizontal before the final stub
  const active = Math.max(1, forced.length - 4);
  return { points: forced, activeSegmentIndex: active };
}

/** Rare for L/R ports; keep V→V+H+V for completeness. */
function expandStubVerticalAndMove(
  points: OrthoPoint[],
  segmentIndex: number,
  newX: number,
): MoveSegmentResult {
  const pts = points.map((p) => ({ ...p }));
  const a = pts[segmentIndex]!;
  const b = pts[segmentIndex + 1]!;
  const dir = Math.sign(newX - a.x) || 1;
  const midY = snapToGrid((a.y + b.y) / 2);
  const x = snapToGrid(newX);
  const finalX =
    Math.abs(x - a.x) < MIN_SEG
      ? snapToGrid(a.x + dir * MIN_SEG)
      : x;

  const next = [
    ...pts.slice(0, segmentIndex + 1),
    { x: a.x, y: midY },
    { x: finalX, y: midY },
    { x: finalX, y: b.y },
    ...pts.slice(segmentIndex + 1),
  ];
  // Remove duplicate b if we kept it
  const forced = forceOrthogonal(next);
  return { points: forced, activeSegmentIndex: segmentIndex + 1 };
}

/**
 * Insert kink on a segment:
 * H → H + V + H
 * V → V + H + V
 */
export function insertKinkOnSegment(
  points: OrthoPoint[],
  segmentIndex: number,
  at: { x: number; y: number },
): OrthoPoint[] {
  return beginMidHandleKink(points, segmentIndex, at).points;
}

function findElbowIndex(
  points: OrthoPoint[],
  elbow: OrthoPoint,
  fallback: number,
): number {
  let cornerIndex = fallback;
  let best = Infinity;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.hypot(points[i]!.x - elbow.x, points[i]!.y - elbow.y);
    if (d < best) {
      best = d;
      cornerIndex = i;
    }
  }
  return cornerIndex;
}

/**
 * Open-chain kink that never moves endpoints. `pin` marks the port attachment:
 * the free run is created on the opposite (junction) side.
 */
function beginOpenChainKink(
  base: OrthoPoint[],
  segmentIndex: number,
  at: { x: number; y: number },
  pin: OpenKinkPin,
): { points: OrthoPoint[]; cornerIndex: number } {
  const segs = routeSegments(base);
  const seg = segs[segmentIndex];
  if (!seg || seg.length < MIN_SEG) {
    return { points: base, cornerIndex: -1 };
  }
  const start = base[0]!;
  const end = base[base.length - 1]!;

  if (seg.horizontal) {
    const y = seg.a.y;
    const left = Math.min(seg.a.x, seg.b.x);
    const right = Math.max(seg.a.x, seg.b.x);
    const mx = snapToGrid(
      Math.max(left + MIN_SEG / 2, Math.min(right - MIN_SEG / 2, at.x)),
    );
    const dir = Math.abs(at.y - y) < 1 ? 1 : Math.sign(at.y - y);
    const y2 = snapToGrid(
      y + dir * Math.max(MIN_SEG, Math.abs(at.y - y) || KINK_JOG),
    );

    if (base.length === 2) {
      // Pin port end → free H faces the other endpoint (junction).
      const pts =
        pin === "end"
          ? [
              { ...start },
              { x: start.x, y: y2 },
              { x: mx, y: y2 },
              { x: mx, y: end.y },
              { ...end },
            ]
          : [
              { ...start },
              { x: mx, y: start.y },
              { x: mx, y: y2 },
              { x: end.x, y: y2 },
              { ...end },
            ];
      const forced = simplifyOrthoPoints(pts);
      const elbow = pin === "end" ? { x: mx, y: y2 } : { x: mx, y: y2 };
      return {
        points: forced,
        cornerIndex: findElbowIndex(forced, elbow, 2),
      };
    }

    const pts = base.map((p) => ({ ...p }));
    const bIdx = segmentIndex + 1;
    if (bIdx >= pts.length - 1) {
      // Last segment ends at pinned endpoint — insert return path
      if (pin === "end") {
        pts.splice(
          bIdx,
          0,
          { x: pts[segmentIndex]!.x, y: y2 },
          { x: mx, y: y2 },
          { x: mx, y: end.y },
        );
      } else {
        pts.splice(
          bIdx,
          0,
          { x: mx, y },
          { x: mx, y: y2 },
          { x: end.x, y: y2 },
        );
      }
    } else if (segmentIndex === 0 && pin === "start") {
      pts[bIdx] = { x: pts[bIdx]!.x, y: y2 };
      pts.splice(bIdx, 0, { x: mx, y }, { x: mx, y: y2 });
    } else if (segmentIndex === 0 && pin === "end") {
      pts.splice(
        1,
        0,
        { x: start.x, y: y2 },
        { x: mx, y: y2 },
        { x: mx, y },
      );
    } else {
      pts[bIdx] = { x: pts[bIdx]!.x, y: y2 };
      pts.splice(bIdx, 0, { x: mx, y }, { x: mx, y: y2 });
    }
    pts[0] = { ...start };
    pts[pts.length - 1] = { ...end };
    const forced = simplifyOrthoPoints(pts);
    return {
      points: forced,
      cornerIndex: findElbowIndex(forced, { x: mx, y: y2 }, 2),
    };
  }

  const x = seg.a.x;
  const top = Math.min(seg.a.y, seg.b.y);
  const bot = Math.max(seg.a.y, seg.b.y);
  const my = snapToGrid(
    Math.max(top + MIN_SEG / 2, Math.min(bot - MIN_SEG / 2, at.y)),
  );
  const dir = Math.abs(at.x - x) < 1 ? 1 : Math.sign(at.x - x);
  const x2 = snapToGrid(
    x + dir * Math.max(MIN_SEG, Math.abs(at.x - x) || KINK_JOG),
  );

  if (base.length === 2) {
    const pts =
      pin === "end"
        ? [
            { ...start },
            { x: x2, y: start.y },
            { x: x2, y: my },
            { x: end.x, y: my },
            { ...end },
          ]
        : [
            { ...start },
            { x: start.x, y: my },
            { x: x2, y: my },
            { x: x2, y: end.y },
            { ...end },
          ];
    const forced = simplifyOrthoPoints(pts);
    return {
      points: forced,
      cornerIndex: findElbowIndex(forced, { x: x2, y: my }, 2),
    };
  }

  const pts = base.map((p) => ({ ...p }));
  const bIdx = segmentIndex + 1;
  if (bIdx >= pts.length - 1) {
    if (pin === "end") {
      pts.splice(
        bIdx,
        0,
        { x: x2, y: pts[segmentIndex]!.y },
        { x: x2, y: my },
        { x: end.x, y: my },
      );
    } else {
      pts.splice(
        bIdx,
        0,
        { x, y: my },
        { x: x2, y: my },
        { x: x2, y: end.y },
      );
    }
  } else {
    pts[bIdx] = { x: x2, y: pts[bIdx]!.y };
    pts.splice(bIdx, 0, { x, y: my }, { x: x2, y: my });
  }
  pts[0] = { ...start };
  pts[pts.length - 1] = { ...end };
  const forced = simplifyOrthoPoints(pts);
  return {
    points: forced,
    cornerIndex: findElbowIndex(forced, { x: x2, y: my }, 2),
  };
}

/**
 * Mid-handle drag: insert a kink on the segment and return the elbow corner
 * index that should follow the pointer in 2D.
 */
export function beginMidHandleKink(
  points: OrthoPoint[],
  segmentIndex: number,
  at: { x: number; y: number },
  pin: OpenKinkPin = "both",
): { points: OrthoPoint[]; cornerIndex: number } {
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const openChain =
    Math.abs(start.x - end.x) < 1 || Math.abs(start.y - end.y) < 1;
  if (openChain) {
    return beginOpenChainKink(orthogonalizeOpen(points), segmentIndex, at, pin);
  }

  const base = forceOrthogonal(points);
  const segs = routeSegments(base);
  const seg = segs[segmentIndex];
  if (!seg || seg.length < MIN_SEG) {
    return { points: base, cornerIndex: -1 };
  }

  const pts = base.map((p) => ({ ...p }));

  if (seg.horizontal) {
    const y = seg.a.y;
    const left = Math.min(seg.a.x, seg.b.x);
    const right = Math.max(seg.a.x, seg.b.x);
    const mx = snapToGrid(
      Math.max(left + MIN_SEG / 2, Math.min(right - MIN_SEG / 2, at.x)),
    );
    const dir = Math.abs(at.y - y) < 1 ? 1 : Math.sign(at.y - y);
    const y2 = snapToGrid(
      y + dir * Math.max(MIN_SEG, Math.abs(at.y - y) || KINK_JOG),
    );
    const bIdx = segmentIndex + 1;
    pts[bIdx] = { x: pts[bIdx]!.x, y: y2 };
    pts.splice(bIdx, 0, { x: mx, y }, { x: mx, y: y2 });
    const forced = forceOrthogonal(pts);
    return {
      points: forced,
      cornerIndex: findElbowIndex(forced, { x: mx, y: y2 }, bIdx + 1),
    };
  }

  const x = seg.a.x;
  const top = Math.min(seg.a.y, seg.b.y);
  const bot = Math.max(seg.a.y, seg.b.y);
  const my = snapToGrid(
    Math.max(top + MIN_SEG / 2, Math.min(bot - MIN_SEG / 2, at.y)),
  );
  const dir = Math.abs(at.x - x) < 1 ? 1 : Math.sign(at.x - x);
  const x2 = snapToGrid(
    x + dir * Math.max(MIN_SEG, Math.abs(at.x - x) || KINK_JOG),
  );
  const bIdx = segmentIndex + 1;
  pts[bIdx] = { x: x2, y: pts[bIdx]!.y };
  pts.splice(bIdx, 0, { x, y: my }, { x: x2, y: my });
  const forced = forceOrthogonal(pts);
  return {
    points: forced,
    cornerIndex: findElbowIndex(forced, { x: x2, y: my }, bIdx + 1),
  };
}

/**
 * Move an interior corner in 2D while keeping adjacent segments orthogonal.
 * The corner sits at the junction of one H and one V; both axes update.
 */
export function moveCorner2D(
  points: OrthoPoint[],
  cornerIndex: number,
  x: number,
  y: number,
): OrthoPoint[] {
  if (cornerIndex <= 0 || cornerIndex >= points.length - 1) {
    return forceOrthogonal(points);
  }

  const start = points[0]!;
  const end = points[points.length - 1]!;
  let nx = snapToGrid(x);
  let ny = snapToGrid(y);

  // Keep corners from sliding into machine bodies via port stubs —
  // but only when the source→target box has a usable X span (not a vertical bus).
  const xLo = Math.min(start.x, end.x) + MIN_PORT_STUB;
  const xHi = Math.max(start.x, end.x) - MIN_PORT_STUB;
  if (xHi > xLo) {
    nx = Math.max(xLo, Math.min(xHi, nx));
  }

  const pts = points.map((p) => ({ ...p }));
  const a = pts[cornerIndex - 1]!;
  const b = pts[cornerIndex + 1]!;
  const acHorizontal = sameY(a, pts[cornerIndex]!) || Math.abs(a.y - pts[cornerIndex]!.y) <= Math.abs(a.x - pts[cornerIndex]!.x);

  pts[cornerIndex] = { x: nx, y: ny };

  if (acHorizontal) {
    // A—H—C—V—B
    if (cornerIndex - 1 === 0) {
      // Source stub: Y locked to source; only X of the vertical moves
      pts[cornerIndex] = { x: nx, y: start.y };
      pts[cornerIndex + 1] = { x: nx, y: b.y };
    } else if (cornerIndex + 1 === pts.length - 1) {
      // Last interior before target stub vertical? uncommon — lock Y to target
      pts[cornerIndex] = { x: nx, y: end.y };
      pts[cornerIndex - 1] = { x: a.x, y: end.y };
    } else {
      pts[cornerIndex - 1] = { x: a.x, y: ny };
      pts[cornerIndex + 1] = { x: nx, y: b.y };
    }
  } else {
    // A—V—C—H—B
    if (cornerIndex + 1 === pts.length - 1) {
      // Target stub: Y locked to target; only X of the vertical moves
      pts[cornerIndex] = { x: nx, y: end.y };
      pts[cornerIndex - 1] = { x: nx, y: a.y };
    } else if (cornerIndex - 1 === 0) {
      // Source is vertical (rare for L/R ports)
      pts[cornerIndex] = { x: start.x, y: ny };
      pts[cornerIndex + 1] = { x: b.x, y: ny };
    } else {
      pts[cornerIndex - 1] = { x: nx, y: a.y };
      pts[cornerIndex + 1] = { x: b.x, y: ny };
    }
  }

  pts[0] = { ...start };
  pts[pts.length - 1] = { ...end };
  return clampPortStubs(forceOrthogonal(pts));
}

/**
 * After a corner/segment drag, collapse near-zero jogs and snap onto nearby
 * foreign (and same-edge) segments so releasing on top of another line fuses.
 */
export function fuseRouteOnRelease(
  points: OrthoPoint[],
  edgeId: string,
  edges: Edge[],
  nodes: Node[],
): OrthoPoint[] {
  let pts = clampPortStubs(forceOrthogonal(points));
  const othersV = collectVerticalSegments(edges, nodes, edgeId, {
    sameNetworkAs: edgeId,
  });
  const othersH = collectHorizontalSegments(edges, nodes, edgeId, {
    sameNetworkAs: edgeId,
  });

  // Snap each free vertical onto nearby foreign verticals
  for (const s of routeSegments(pts)) {
    if (s.horizontal || s.isStub || s.length < 4) continue;
    // Same-edge siblings as additional targets
    const targets = [
      ...othersV,
      ...routeSegments(pts)
        .filter(
          (o) =>
            !o.horizontal &&
            !o.isStub &&
            o.length >= 4 &&
            o.index !== s.index,
        )
        .map((o) => ({
          edgeId,
          x: o.a.x,
          y1: Math.min(o.a.y, o.b.y),
          y2: Math.max(o.a.y, o.b.y),
        })),
    ];
    const snapped = snapVerticalX(
      s.a.x,
      Math.min(s.a.y, s.b.y),
      Math.max(s.a.y, s.b.y),
      targets,
      null,
      CORNER_SNAP_OVERLAP_PAD,
    );
    if (Math.abs(snapped - s.a.x) > 0.5) {
      const next = pts.map((p) => ({ ...p }));
      next[s.index] = { x: snapped, y: next[s.index]!.y };
      next[s.index + 1] = { x: snapped, y: next[s.index + 1]!.y };
      next[0] = { ...pts[0]! };
      next[next.length - 1] = { ...pts[pts.length - 1]! };
      pts = clampPortStubs(forceOrthogonal(next));
    }
  }

  // Snap each free horizontal onto nearby foreign horizontals
  for (const s of routeSegments(pts)) {
    if (!s.horizontal || s.isStub || s.length < 4) continue;
    const targets = [
      ...othersH,
      ...routeSegments(pts)
        .filter(
          (o) =>
            o.horizontal &&
            !o.isStub &&
            o.length >= 4 &&
            o.index !== s.index,
        )
        .map((o) => ({
          edgeId,
          y: o.a.y,
          x1: Math.min(o.a.x, o.b.x),
          x2: Math.max(o.a.x, o.b.x),
        })),
    ];
    const snapped = snapHorizontalY(
      s.a.y,
      Math.min(s.a.x, s.b.x),
      Math.max(s.a.x, s.b.x),
      targets,
      null,
      CORNER_SNAP_OVERLAP_PAD,
    );
    if (Math.abs(snapped - s.a.y) > 0.5) {
      const next = pts.map((p) => ({ ...p }));
      next[s.index] = { x: next[s.index]!.x, y: snapped };
      next[s.index + 1] = { x: next[s.index + 1]!.x, y: snapped };
      next[0] = { ...pts[0]! };
      next[next.length - 1] = { ...pts[pts.length - 1]! };
      pts = clampPortStubs(forceOrthogonal(next));
    }
  }

  return simplifyOrthoPoints(pts);
}

export function removeCornerAt(
  points: OrthoPoint[],
  pointIndex: number,
  sourceX: number,
  targetX: number,
): OrthoPoint[] | null {
  if (pointIndex <= 0 || pointIndex >= points.length - 1) return null;
  const next = points.filter((_, i) => i !== pointIndex);
  const forced = forceOrthogonal(next);
  const interiors = forced.length - 2;
  if (interiors < minInteriorCorners(sourceX, targetX)) return null;
  return forced;
}

export type VerticalSegInfo = {
  edgeId: string;
  x: number;
  y1: number;
  y2: number;
};

export type HorizontalSegInfo = {
  edgeId: string;
  y: number;
  x1: number;
  x2: number;
};

function portAbsPos(
  nodes: Node[],
  portId: string,
): { x: number; y: number } | null {
  const port = nodes.find((n) => n.id === portId && n.type === "itemPort");
  if (!port?.parentId) return null;
  const frame = nodes.find((n) => n.id === port.parentId);
  if (!frame) return null;
  const kind = (port.data as { kind?: string })?.kind;
  const localX =
    kind === "out" ? port.position.x + MACHINE_LAYOUT.PORT_W : port.position.x;
  return {
    x: frame.position.x + localX,
    y: frame.position.y + port.position.y + PORT_ROW / 2,
  };
}

export function collectVerticalSegments(
  edges: Edge[],
  nodes: Node[],
  excludeEdgeId?: string,
  opts?: {
    sameNetworkAs?: string;
    resolvePoints?: (edge: Edge) => OrthoPoint[] | null;
  },
): VerticalSegInfo[] {
  const out: VerticalSegInfo[] = [];
  for (const e of edges) {
    if (e.id === excludeEdgeId) continue;
    if ((e.data as { kind?: string } | undefined)?.kind === "routingSegment") {
      continue;
    }
    let pts: OrthoPoint[] | null = null;
    if (opts?.resolvePoints) {
      pts = opts.resolvePoints(e);
    }
    if (!pts) {
      const src = portAbsPos(nodes, e.source);
      const tgt = portAbsPos(nodes, e.target);
      if (!src || !tgt) continue;
      pts = resolveRoutePoints(src.x, src.y, tgt.x, tgt.y, e.data, e.id);
    }
    for (const s of routeSegments(pts)) {
      if (s.horizontal || s.length < 4) continue;
      out.push({
        edgeId: e.id,
        x: s.a.x,
        y1: Math.min(s.a.y, s.b.y),
        y2: Math.max(s.a.y, s.b.y),
      });
    }
  }
  if (opts?.sameNetworkAs) {
    return filterSegmentsToSameNetwork(opts.sameNetworkAs, out, edges);
  }
  return out;
}

export function collectHorizontalSegments(
  edges: Edge[],
  nodes: Node[],
  excludeEdgeId?: string,
  opts?: {
    sameNetworkAs?: string;
    resolvePoints?: (edge: Edge) => OrthoPoint[] | null;
  },
): HorizontalSegInfo[] {
  const out: HorizontalSegInfo[] = [];
  for (const e of edges) {
    if (e.id === excludeEdgeId) continue;
    if ((e.data as { kind?: string } | undefined)?.kind === "routingSegment") {
      continue;
    }
    let pts: OrthoPoint[] | null = null;
    if (opts?.resolvePoints) {
      pts = opts.resolvePoints(e);
    }
    if (!pts) {
      const src = portAbsPos(nodes, e.source);
      const tgt = portAbsPos(nodes, e.target);
      if (!src || !tgt) continue;
      pts = resolveRoutePoints(src.x, src.y, tgt.x, tgt.y, e.data, e.id);
    }
    for (const s of routeSegments(pts)) {
      if (!s.horizontal || s.length < 4) continue;
      out.push({
        edgeId: e.id,
        y: s.a.y,
        x1: Math.min(s.a.x, s.b.x),
        x2: Math.max(s.a.x, s.b.x),
      });
    }
  }
  if (opts?.sameNetworkAs) {
    return filterSegmentsToSameNetwork(opts.sameNetworkAs, out, edges);
  }
  return out;
}

/** Keep only segments belonging to the same undirected feed network as `edgeId`. */
export function filterSegmentsToSameNetwork<T extends { edgeId: string }>(
  edgeId: string,
  segments: T[],
  edges: Edge[],
): T[] {
  const net = buildEdgeNetworkIds(edges);
  const mine = net.get(edgeId);
  if (mine === undefined) return [];
  return segments.filter((s) => net.get(s.edgeId) === mine);
}

function yRangesOverlap(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
  pad = 8,
): boolean {
  return a1 - pad <= b2 && b1 - pad <= a2;
}

function xRangesOverlap(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
  pad = 8,
): boolean {
  return a1 - pad <= b2 && b1 - pad <= a2;
}

export function snapVerticalX(
  proposedX: number,
  segY1: number,
  segY2: number,
  others: VerticalSegInfo[],
  heldSnapX: number | null,
  overlapPad = 8,
): number {
  if (heldSnapX !== null) {
    for (const o of others) {
      if (Math.abs(o.x - heldSnapX) > 0.5) continue;
      if (!yRangesOverlap(segY1, segY2, o.y1, o.y2, overlapPad)) continue;
      if (Math.abs(proposedX - o.x) < VERTICAL_SNAP_HOLD) return o.x;
    }
  }
  let best: number | null = null;
  let bestDist = VERTICAL_SNAP_ENGAGE;
  for (const o of others) {
    if (!yRangesOverlap(segY1, segY2, o.y1, o.y2, overlapPad)) continue;
    const d = Math.abs(proposedX - o.x);
    if (d < bestDist) {
      bestDist = d;
      best = o.x;
    }
  }
  return best ?? proposedX;
}

export function snapHorizontalY(
  proposedY: number,
  segX1: number,
  segX2: number,
  others: HorizontalSegInfo[],
  heldSnapY: number | null,
  overlapPad = 8,
): number {
  if (heldSnapY !== null) {
    for (const o of others) {
      if (Math.abs(o.y - heldSnapY) > 0.5) continue;
      if (!xRangesOverlap(segX1, segX2, o.x1, o.x2, overlapPad)) continue;
      if (Math.abs(proposedY - o.y) < VERTICAL_SNAP_HOLD) return o.y;
    }
  }
  let best: number | null = null;
  let bestDist = VERTICAL_SNAP_ENGAGE;
  for (const o of others) {
    if (!xRangesOverlap(segX1, segX2, o.x1, o.x2, overlapPad)) continue;
    const d = Math.abs(proposedY - o.y);
    if (d < bestDist) {
      bestDist = d;
      best = o.y;
    }
  }
  return best ?? proposedY;
}

function distToSegment(
  p: { x: number; y: number },
  a: OrthoPoint,
  b: OrthoPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function nearestSegmentIndex(
  points: OrthoPoint[],
  at: { x: number; y: number },
): number {
  const segs = routeSegments(points);
  let best = 0;
  let bestDist = Infinity;
  for (const s of segs) {
    const d = distToSegment(at, s.a, s.b);
    if (d < bestDist) {
      bestDist = d;
      best = s.index;
    }
  }
  return best;
}

export function nearestInteriorCornerIndex(
  points: OrthoPoint[],
  at: { x: number; y: number },
  maxDist = 24,
): number {
  let best = -1;
  let bestDist = maxDist;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Keep locked segment during drag — do not jump to other segments. */
export function pickSegmentUnderPointer(
  _points: OrthoPoint[],
  _pointer: { x: number; y: number },
  _preferredAxis: "h" | "v" | null,
  lockedIndex?: number,
): number {
  return lockedIndex ?? 0;
}

// --- Schematic bridge arches (vertical jumps over foreign horizontals) ---

/** Half-width of the jump arc on a vertical trunk (flow px). */
export const BRIDGE_ARCH_RADIUS = 7;
/** Ignore crossings this close to a segment endpoint (corners / T-joins). */
export const BRIDGE_ENDPOINT_MARGIN = 6;

export type BridgeCrossing = {
  x: number;
  y: number;
};

function resolveEdgePointsLive(
  edge: Edge,
  nodes: Node[],
  resolvePoints?: (edge: Edge) => OrthoPoint[] | null,
): OrthoPoint[] | null {
  const preview = getOrthoDragPreview(edge.id);
  if (preview && preview.length >= 2) return preview;
  if (resolvePoints) {
    const custom = resolvePoints(edge);
    if (custom && custom.length >= 2) return custom;
  }
  const src = portAbsPos(nodes, edge.source);
  const tgt = portAbsPos(nodes, edge.target);
  if (!src || !tgt) return null;
  return resolveRoutePoints(src.x, src.y, tgt.x, tgt.y, edge.data, edge.id);
}

/** Undirected port connectivity via edges (same feed / belt network). */
export function buildEdgeNetworkIds(edges: Edge[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id);
    if (p === undefined) {
      parent.set(id, id);
      return id;
    }
    if (p === id) return id;
    const r = find(p);
    parent.set(id, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const e of edges) {
    if (e.data?.suggested) continue;
    if ((e.data as { kind?: string } | undefined)?.kind === "routingSegment") {
      continue;
    }
    // Ignore display-only junction endpoints
    if (e.source.startsWith("rj-") || e.target.startsWith("rj-")) continue;
    union(e.source, e.target);
  }
  const edgeNet = new Map<string, string>();
  for (const e of edges) {
    if (e.data?.suggested) continue;
    if ((e.data as { kind?: string } | undefined)?.kind === "routingSegment") {
      continue;
    }
    edgeNet.set(e.id, find(e.source));
  }
  return edgeNet;
}

function edgesShareNetwork(
  edgeNet: Map<string, string>,
  a: string,
  b: string,
): boolean {
  const na = edgeNet.get(a);
  const nb = edgeNet.get(b);
  return na !== undefined && nb !== undefined && na === nb;
}

export type BridgeCrossingOpts = {
  /** Logical edge id used for network membership (segment edges). */
  networkEdgeId?: string;
  /** Override point resolution (e.g. compose shared routePath). */
  resolvePoints?: (edge: Edge) => OrthoPoint[] | null;
};

/**
 * Points where this edge’s vertical segments cross a horizontal from another
 * network. Horizontals stay straight; these y-positions get an arch on the V.
 */
export function findBridgeCrossings(
  edgeId: string,
  points: OrthoPoint[],
  edges: Edge[],
  nodes: Node[],
  opts?: BridgeCrossingOpts,
): BridgeCrossing[] {
  const edgeNet = buildEdgeNetworkIds(edges);
  const probeId = opts?.networkEdgeId ?? edgeId;
  const myNet = edgeNet.get(probeId);
  const crossings: BridgeCrossing[] = [];
  const seen = new Set<string>();

  const verts = routeSegments(points).filter(
    (s) => !s.horizontal && s.length >= BRIDGE_ARCH_RADIUS * 2 + 2,
  );
  if (verts.length === 0) return crossings;

  for (const e of edges) {
    if (e.id === edgeId || e.data?.suggested) continue;
    if ((e.data as { kind?: string } | undefined)?.kind === "routingSegment") {
      continue;
    }
    if (myNet !== undefined && edgesShareNetwork(edgeNet, probeId, e.id)) {
      continue;
    }
    const otherPts = resolveEdgePointsLive(e, nodes, opts?.resolvePoints);
    if (!otherPts) continue;
    for (const h of routeSegments(otherPts)) {
      if (!h.horizontal || h.length < 4) continue;
      const y = h.a.y;
      const x1 = Math.min(h.a.x, h.b.x);
      const x2 = Math.max(h.a.x, h.b.x);
      for (const v of verts) {
        const x = v.a.x;
        const y1 = Math.min(v.a.y, v.b.y);
        const y2 = Math.max(v.a.y, v.b.y);
        if (x <= x1 + BRIDGE_ENDPOINT_MARGIN || x >= x2 - BRIDGE_ENDPOINT_MARGIN) {
          continue;
        }
        if (y <= y1 + BRIDGE_ENDPOINT_MARGIN || y >= y2 - BRIDGE_ENDPOINT_MARGIN) {
          continue;
        }
        const key = `${x.toFixed(1)}:${y.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        crossings.push({ x, y });
      }
    }
  }
  return crossings;
}

/**
 * Polyline path with semicircle jumps on vertical runs at `crossings`.
 * Arch always bulges toward +X so overlapping bridges stay consistent.
 */
export function pointsToSvgPathWithBridges(
  points: OrthoPoint[],
  crossings: readonly BridgeCrossing[],
  radius = BRIDGE_ARCH_RADIUS,
): string {
  if (points.length === 0) return "";
  if (crossings.length === 0) return pointsToSvgPath(points);

  const byX = new Map<string, number[]>();
  for (const c of crossings) {
    const key = c.x.toFixed(2);
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key)!.push(c.y);
  }
  for (const ys of byX.values()) ys.sort((a, b) => a - b);

  const first = points[0]!;
  let d = `M ${first.x},${first.y}`;
  let cur = first;

  for (let i = 1; i < points.length; i++) {
    const next = points[i]!;
    const horizontal = Math.abs(next.y - cur.y) <= 0.5;
    const vertical = Math.abs(next.x - cur.x) <= 0.5;

    if (!vertical || horizontal) {
      d += ` L ${next.x},${next.y}`;
      cur = next;
      continue;
    }

    const x = cur.x;
    const yStart = cur.y;
    const yEnd = next.y;
    const goingDown = yEnd > yStart;
    const lo = Math.min(yStart, yEnd);
    const hi = Math.max(yStart, yEnd);
    const key = x.toFixed(2);
    const ys = (byX.get(key) ?? []).filter(
      (y) => y > lo + radius && y < hi - radius,
    );
    // Travel order along the segment
    const ordered = goingDown ? ys : [...ys].reverse();

    // Drop crossings that would overlap previous arch
    const filtered: number[] = [];
    for (const y of ordered) {
      if (
        filtered.length > 0 &&
        Math.abs(y - filtered[filtered.length - 1]!) < radius * 2 + 1
      ) {
        continue;
      }
      filtered.push(y);
    }

    let yCursor = yStart;
    for (const y of filtered) {
      const approach = goingDown ? y - radius : y + radius;
      const leave = goingDown ? y + radius : y - radius;
      d += ` L ${x},${approach}`;
      // Sweep so the arc bulges toward +X regardless of travel direction.
      const sweep = goingDown ? 0 : 1;
      d += ` A ${radius} ${radius} 0 0 ${sweep} ${x},${leave}`;
      yCursor = leave;
    }
    if (Math.abs(yCursor - yEnd) > 0.01) {
      d += ` L ${x},${yEnd}`;
    }
    cur = next;
  }
  return d;
}

