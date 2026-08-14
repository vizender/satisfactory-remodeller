import { SNAP_ALIGN } from "./constants";
import { snap } from "./geometry";
import { isPortVertex } from "./nets";
import { avoidIllegalFuseCoord, illegalFuseAlignments } from "./portStub";
import type { Point, RouteGraph, RouteSegment, RouteVertex } from "./types";

export type AlignHit = {
  axis: "h" | "v";
  coord: number;
};

export type DragSnapOpts = {
  /** Grab distance in flow px. `false` disables alignment (grid snap remains). */
  align?: number | false;
};

function alignThreshold(opts?: DragSnapOpts): number {
  if (opts?.align === false) return 0;
  if (typeof opts?.align === "number") return opts.align;
  return SNAP_ALIGN;
}

function incident(
  graph: RouteGraph,
  vertexId: string,
): RouteSegment[] {
  return graph.segments.filter((s) => s.a === vertexId || s.b === vertexId);
}

function otherId(s: RouteSegment, vertexId: string): string {
  return s.a === vertexId ? s.b : s.a;
}

function onNet(graph: RouteGraph, vertexId: string, netId: string): boolean {
  return incident(graph, vertexId).some((s) => s.netId === netId);
}

/**
 * Snap only when the move would simplify the net: flatten a jog/kink, or
 * slide a segment through a same-net 3SI or corner (3SI+3SI → 4SI, or
 * a corner landing on the run). Ports and 4SIs are not targets.
 */
export function alignmentTargets(
  graph: RouteGraph,
  segmentId: string,
): number[] {
  const seg = graph.segments.find((s) => s.id === segmentId);
  if (!seg) return [];
  const byId = new Map(graph.vertices.map((v) => [v.id, v]));
  const a = byId.get(seg.a);
  const b = byId.get(seg.b);
  if (!a || !b) return [];
  const coords = new Set<number>();

  const addJog = (end: RouteVertex) => {
    for (const s of incident(graph, end.id)) {
      if (s.id === seg.id || s.axis === seg.axis) continue;
      const ov = byId.get(otherId(s, end.id));
      if (!ov || isPortVertex(ov)) continue;
      coords.add(snap(seg.axis === "v" ? ov.x : ov.y));
    }
  };
  addJog(a);
  addJog(b);

  const lo = seg.axis === "v" ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
  const hi = seg.axis === "v" ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  for (const v of graph.vertices) {
    if (v.kind !== "3si" && v.kind !== "corner") continue;
    if (v.id === a.id || v.id === b.id) continue;
    if (!onNet(graph, v.id, seg.netId)) continue;
    const along = seg.axis === "v" ? v.y : v.x;
    if (along < lo - 0.5 || along > hi + 0.5) continue;
    coords.add(snap(seg.axis === "v" ? v.x : v.y));
  }

  if (seg.axis === "h") {
    const banned = new Set(illegalFuseAlignments(graph, segmentId));
    return [...coords].filter((c) => !banned.has(c));
  }

  return [...coords];
}

export function snapAlignCoord(
  raw: number,
  targets: number[],
  threshold: number,
): { coord: number; snapped: boolean } {
  if (!(threshold > 0) || targets.length === 0) {
    return { coord: raw, snapped: false };
  }
  let best: number | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = Math.abs(raw - t);
    if (d > threshold) continue;
    if (best === null || d < bestD || (d === bestD && t < best)) {
      best = t;
      bestD = d;
    }
  }
  if (best === null) return { coord: raw, snapped: false };
  return { coord: best, snapped: true };
}

/**
 * Snap a drag/kink pointer onto a complexity-reducing alignment.
 * `threshold <= 0` leaves the pointer unchanged.
 */
export function snapDragPointer(
  graph: RouteGraph,
  segmentId: string,
  pointer: Point,
  opts?: DragSnapOpts | number | false,
): { pointer: Point; hit: AlignHit | null } {
  const threshold =
    typeof opts === "number" || opts === false
      ? opts === false
        ? 0
        : opts
      : alignThreshold(opts);
  const seg = graph.segments.find((s) => s.id === segmentId);
  if (!seg) return { pointer, hit: null };

  let coord = seg.axis === "h" ? pointer.y : pointer.x;
  let hit: AlignHit | null = null;
  if (threshold > 0) {
    const { coord: snappedCoord, snapped } = snapAlignCoord(
      coord,
      alignmentTargets(graph, segmentId),
      threshold,
    );
    if (snapped) {
      coord = snappedCoord;
      hit = { axis: seg.axis, coord };
    }
  }
  if (seg.axis === "h") {
    const skipped = avoidIllegalFuseCoord(graph, segmentId, coord);
    if (skipped !== coord) hit = null;
    coord = skipped;
    return { pointer: { x: pointer.x, y: coord }, hit };
  }
  return { pointer: { x: coord, y: pointer.y }, hit };
}
