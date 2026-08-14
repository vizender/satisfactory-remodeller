import { snapToGrid } from "@/constants/flowGrid";
import { EPS, MIN_SEG } from "./constants";
import type { Aabb, Axis, Point } from "./types";

export function snap(n: number): number {
  return snapToGrid(n);
}

export function snapPt(p: Point): Point {
  return { x: snap(p.x), y: snap(p.y) };
}

export function almostEq(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) < eps;
}

export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function axisOf(a: Point, b: Point): Axis | null {
  const sameX = almostEq(a.x, b.x);
  const sameY = almostEq(a.y, b.y);
  if (sameX && sameY) return null;
  if (sameY) return "h";
  if (sameX) return "v";
  return null;
}

export function segLength(a: Point, b: Point): number {
  return dist(a, b);
}

export function isZeroLength(a: Point, b: Point): boolean {
  return segLength(a, b) < MIN_SEG;
}

/** Distance from point to axis-aligned segment. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function pointOnSegment(p: Point, a: Point, b: Point, eps = EPS): boolean {
  return distToSegment(p, a, b) <= eps;
}

export function inflateAabb(box: Aabb, pad: number): Aabb {
  return {
    x: box.x - pad,
    y: box.y - pad,
    w: box.w + pad * 2,
    h: box.h + pad * 2,
  };
}

export function pointInAabb(p: Point, box: Aabb): boolean {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

export function hOverlapsAabb(y: number, x1: number, x2: number, box: Aabb): boolean {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  if (y < box.y - EPS || y > box.y + box.h + EPS) return false;
  return hi >= box.x - EPS && lo <= box.x + box.w + EPS;
}

export function vOverlapsAabb(x: number, y1: number, y2: number, box: Aabb): boolean {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  if (x < box.x - EPS || x > box.x + box.w + EPS) return false;
  return hi >= box.y - EPS && lo <= box.y + box.h + EPS;
}

/**
 * Proper crossing of an H and a V segment (not merely touching at an endpoint
 * that they already share).
 */
export function hvIntersection(
  hA: Point,
  hB: Point,
  vA: Point,
  vB: Point,
): Point | null {
  const y = hA.y;
  const x = vA.x;
  const hx1 = Math.min(hA.x, hB.x);
  const hx2 = Math.max(hA.x, hB.x);
  const vy1 = Math.min(vA.y, vB.y);
  const vy2 = Math.max(vA.y, vB.y);
  const onH = x > hx1 + EPS && x < hx2 - EPS;
  const onV = y > vy1 + EPS && y < vy2 - EPS;
  if (!onH || !onV) return null;
  if (!almostEq(hA.y, hB.y) || !almostEq(vA.x, vB.x)) return null;
  return { x, y };
}

export function otherEnd(a: string, b: string, from: string): string {
  return from === a ? b : a;
}
