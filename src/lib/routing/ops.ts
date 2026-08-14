import {
  KINK_JOG,
  MIN_PORT_STUB,
  MIN_SEG,
} from "./constants";
import { almostEq, snap } from "./geometry";
import { isPortGluedH, isPortVertex } from "./nets";
import { collapseWorking } from "./collapse";
import { snapDragPointer, type DragSnapOpts } from "./snap";
import type { Point, RouteGraph, RouteSegment, RouteVertex } from "./types";
import {
  addSegment,
  addVertex,
  asGraph,
  getOrCreateAt,
  splitSegmentAt,
  toWorking,
  wDegree,
  wIncident,
  type WorkingGraph,
} from "./working";

function ends(w: WorkingGraph, seg: RouteSegment): [RouteVertex, RouteVertex] | null {
  const a = w.vertices.get(seg.a);
  const b = w.vertices.get(seg.b);
  if (!a || !b) return null;
  return [a, b];
}

/**
 * Detach `seg` from a shared junction and reconnect via a perpendicular kink.
 * The junction stays put so the rest of the bus is not translated.
 */
function splitAndSlide(
  w: WorkingGraph,
  seg: RouteSegment,
  junctionId: string,
  coord: number,
): void {
  const j = w.vertices.get(junctionId);
  if (!j || (seg.a !== junctionId && seg.b !== junctionId)) return;

  if (seg.axis === "h") {
    const newY = snap(coord);
    const vSegs = wIncident(w, junctionId).filter(
      (s) => s.axis === "v" && s.id !== seg.id,
    );
    let slide: RouteVertex | undefined;
    for (const vSeg of vSegs) {
      const otherId = vSeg.a === junctionId ? vSeg.b : vSeg.a;
      const ov = w.vertices.get(otherId);
      if (!ov) continue;
      const lo = Math.min(j.y, ov.y);
      const hi = Math.max(j.y, ov.y);
      if (newY > lo + 0.5 && newY < hi - 0.5) {
        slide = splitSegmentAt(w, vSeg, j.x, newY) ?? undefined;
        break;
      }
      if (almostEq(newY, ov.y)) {
        slide = ov;
        break;
      }
    }
    if (!slide) {
      slide = getOrCreateAt(w, j.x, newY, seg.netId);
      addSegment(w, j.id, slide.id, seg.netId, "v");
    }
    if (seg.a === junctionId) seg.a = slide.id;
    else seg.b = slide.id;
  } else {
    const newX = snap(coord);
    const hSegs = wIncident(w, junctionId).filter(
      (s) => s.axis === "h" && s.id !== seg.id,
    );
    let slide: RouteVertex | undefined;
    for (const hSeg of hSegs) {
      const otherId = hSeg.a === junctionId ? hSeg.b : hSeg.a;
      const ov = w.vertices.get(otherId);
      if (!ov || isPortVertex(ov)) continue;
      const lo = Math.min(j.x, ov.x);
      const hi = Math.max(j.x, ov.x);
      if (newX > lo + 0.5 && newX < hi - 0.5) {
        slide = splitSegmentAt(w, hSeg, newX, j.y) ?? undefined;
        break;
      }
      if (almostEq(newX, ov.x)) {
        slide = ov;
        break;
      }
    }
    if (!slide) {
      slide = getOrCreateAt(w, newX, j.y, seg.netId);
      addSegment(w, j.id, slide.id, seg.netId, "h");
    }
    if (seg.a === junctionId) seg.a = slide.id;
    else seg.b = slide.id;
  }
}

function isSharedJunction(
  w: WorkingGraph,
  vertexId: string,
  seg: RouteSegment,
): boolean {
  const v = w.vertices.get(vertexId);
  if (!v || isPortVertex(v)) return true;
  if (wDegree(w, vertexId) >= 3) return true;
  return wIncident(w, vertexId).some(
    (s) => s.id !== seg.id && s.axis === seg.axis,
  );
}

/**
 * Keep a dragged V outside every machine it stubs into: H from a port to the
 * V run stays at least MIN_PORT_STUB and pointing away from the port.
 */
function clampVerticalDragX(
  w: WorkingGraph,
  seg: RouteSegment,
  desiredX: number,
): number {
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  for (const id of [seg.a, seg.b]) {
    const atV = w.vertices.get(id);
    if (!atV) continue;
    for (const s of wIncident(w, id)) {
      if (s.axis !== "h") continue;
      const oid = s.a === id ? s.b : s.a;
      const ov = w.vertices.get(oid);
      if (!ov || !isPortVertex(ov)) continue;
      if (ov.x <= atV.x) lo = Math.max(lo, snap(ov.x + MIN_PORT_STUB));
      else hi = Math.min(hi, snap(ov.x - MIN_PORT_STUB));
    }
  }
  const x = snap(desiredX);
  if (lo > hi) {
    const cur = w.vertices.get(seg.a)?.x ?? x;
    return snap(cur);
  }
  return snap(Math.max(lo, Math.min(hi, x)));
}

function translateFreeEnd(
  w: WorkingGraph,
  vertexId: string,
  axis: "h" | "v",
  coord: number,
): void {
  const v = w.vertices.get(vertexId);
  if (!v || isPortVertex(v)) return;
  if (axis === "h") v.y = snap(coord);
  else v.x = snap(coord);
}

/** Perpendicular translation of a segment body. Port-glued H stubs do not move. */
export function dragSegment(
  graph: RouteGraph,
  segmentId: string,
  pointer: Point,
  opts?: DragSnapOpts,
): RouteGraph {
  const w = toWorking(graph);
  const seg = w.segments.get(segmentId);
  if (!seg) return graph;
  if (isPortGluedH(graph, seg)) return graph;

  const aligned = snapDragPointer(graph, segmentId, pointer, opts).pointer;
  let coord = seg.axis === "h" ? aligned.y : aligned.x;
  if (seg.axis === "v") coord = clampVerticalDragX(w, seg, coord);

  const origA = seg.a;
  const origB = seg.b;
  const aJ = isSharedJunction(w, origA, seg);
  const bJ = isSharedJunction(w, origB, seg);
  if (aJ) splitAndSlide(w, seg, origA, coord);
  if (bJ) splitAndSlide(w, seg, origB, coord);
  if (!aJ) translateFreeEnd(w, origA, seg.axis, coord);
  if (!bJ) translateFreeEnd(w, origB, seg.axis, coord);

  collapseWorking(w);
  return asGraph(w);
}

function uKinkHorizontal(
  w: WorkingGraph,
  seg: RouteSegment,
  click: Point,
  newY: number,
): void {
  const pair = ends(w, seg);
  if (!pair) return;
  let [left, right] = pair;
  if (left.x > right.x) [left, right] = [right, left];
  const leftPort = isPortVertex(left);
  const rightPort = isPortVertex(right);
  const ny = snap(
    Math.abs(newY - left.y) < MIN_SEG
      ? left.y + Math.sign(newY - left.y || 1) * KINK_JOG
      : newY,
  );

  const minLeft = left.x + (leftPort ? MIN_PORT_STUB : MIN_SEG);
  const maxRight = right.x - (rightPort ? MIN_PORT_STUB : MIN_SEG);

  let x1: number;
  let x2: number;
  if (leftPort && rightPort) {
    x1 = snap(left.x + MIN_PORT_STUB);
    x2 = snap(right.x - MIN_PORT_STUB);
    if (x2 <= x1) x2 = snap(x1 + KINK_JOG);
  } else if (leftPort && !rightPort) {
    x1 = snap(left.x + MIN_PORT_STUB);
    x2 = snap(Math.max(x1 + MIN_SEG, Math.min(click.x + KINK_JOG / 2, maxRight)));
  } else if (!leftPort && rightPort) {
    x2 = snap(right.x - MIN_PORT_STUB);
    x1 = snap(Math.min(x2 - MIN_SEG, Math.max(click.x - KINK_JOG / 2, minLeft)));
  } else {
    x1 = snap(Math.max(minLeft, click.x - KINK_JOG / 2));
    x2 = snap(Math.min(maxRight, click.x + KINK_JOG / 2));
    if (x2 - x1 < MIN_SEG) {
      x1 = snap(click.x);
      x2 = snap(click.x + KINK_JOG);
    }
  }

  const netId = seg.netId;
  w.segments.delete(seg.id);
  const v1 = addVertex(w, x1, left.y);
  const v2 = addVertex(w, x1, ny);
  const v3 = addVertex(w, x2, ny);
  const v4 = addVertex(w, x2, right.y);
  addSegment(w, left.id, v1.id, netId, "h");
  addSegment(w, v1.id, v2.id, netId, "v");
  addSegment(w, v2.id, v3.id, netId, "h");
  addSegment(w, v3.id, v4.id, netId, "v");
  addSegment(w, v4.id, right.id, netId, "h");
}

function uKinkVertical(
  w: WorkingGraph,
  seg: RouteSegment,
  click: Point,
  newX: number,
): void {
  const pair = ends(w, seg);
  if (!pair) return;
  let [top, bot] = pair;
  if (top.y > bot.y) [top, bot] = [bot, top];
  const nx = snap(
    Math.abs(newX - top.x) < MIN_SEG
      ? top.x + Math.sign(newX - top.x || 1) * KINK_JOG
      : newX,
  );
  const minTop = top.y + MIN_SEG;
  const maxBot = bot.y - MIN_SEG;
  let y1 = snap(Math.max(minTop, click.y - KINK_JOG / 2));
  let y2 = snap(Math.min(maxBot, click.y + KINK_JOG / 2));
  if (y2 - y1 < MIN_SEG) {
    y1 = snap(click.y);
    y2 = snap(click.y + KINK_JOG);
  }
  const netId = seg.netId;
  w.segments.delete(seg.id);
  const v1 = addVertex(w, top.x, y1);
  const v2 = addVertex(w, nx, y1);
  const v3 = addVertex(w, nx, y2);
  const v4 = addVertex(w, top.x, y2);
  addSegment(w, top.id, v1.id, netId, "v");
  addSegment(w, v1.id, v2.id, netId, "h");
  addSegment(w, v2.id, v3.id, netId, "v");
  addSegment(w, v3.id, v4.id, netId, "h");
  addSegment(w, v4.id, bot.id, netId, "v");
}

/**
 * Insert a kink at `click`. H → U-shape (5 segments) so both ends stay put.
 * Port stubs keep a min-length H glued to the port Y.
 */
export function kinkSegment(
  graph: RouteGraph,
  segmentId: string,
  click: Point,
  pointer: Point,
  opts?: DragSnapOpts,
): RouteGraph {
  const w = toWorking(graph);
  const seg = w.segments.get(segmentId);
  if (!seg) return graph;
  const aligned = snapDragPointer(graph, segmentId, pointer, opts).pointer;
  if (seg.axis === "h") uKinkHorizontal(w, seg, click, aligned.y);
  else uKinkVertical(w, seg, click, aligned.x);
  collapseWorking(w);
  return asGraph(w);
}

export function mergeVerticesIfPossible(
  graph: RouteGraph,
  aId: string,
  bId: string,
): RouteGraph {
  const w = toWorking(graph);
  const a = w.vertices.get(aId);
  const b = w.vertices.get(bId);
  if (!a || !b) return graph;
  const connecting = [...w.segments.values()].filter(
    (s) =>
      (s.a === aId && s.b === bId) || (s.a === bId && s.b === aId),
  ).length;
  const combined = wDegree(w, aId) + wDegree(w, bId) - connecting;
  if (combined > 4) return graph;
  const keep = isPortVertex(a) ? a : isPortVertex(b) ? b : a;
  const drop = keep.id === a.id ? b : a;
  if (drop.portId && keep.portId && drop.portId !== keep.portId) return graph;
  for (const s of w.segments.values()) {
    if (s.a === drop.id) s.a = keep.id;
    if (s.b === drop.id) s.b = keep.id;
    if (s.a === s.b) w.segments.delete(s.id);
  }
  w.vertices.delete(drop.id);
  keep.x = snap((a.x + b.x) / 2);
  keep.y = snap((a.y + b.y) / 2);
  collapseWorking(w);
  return asGraph(w);
}
