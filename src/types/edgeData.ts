/** Absolute flow-space corner for orthogonal routing. */
export type OrthoPoint = { x: number; y: number };

/**
 * Corner relative to the source→target handle box.
 * u: 0 = sourceX, 1 = targetX (may be outside [0,1] for stubs / buses)
 * v: 0 = sourceY, 1 = targetY
 */
export type OrthoNorm = { u: number; v: number };

export type RouteAnchor = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
};

/** Locked intersection vertical: absolute X + which V on the route. */
export type LockedVertical = { x: number; ord: number };

/** Routing metadata stored on XYFlow edge `data` (topology stays source/target). */
export type ItemEdgeData = {
  itemId: string;
  /** @deprecated Prefer cornersNorm. Absolute vertical bend X. */
  bendX?: number;
  /** @deprecated Prefer cornersNorm. Absolute interior corners. */
  corners?: OrthoPoint[];
  /**
   * Interior corners as fractions of the source→target box.
   * Survives machine drags by interpolating with live handle positions.
   */
  cornersNorm?: OrthoNorm[];
  /**
   * Handle positions when absolute `corners` / `bendX` were written.
   * Used once to migrate legacy absolute routes to cornersNorm.
   */
  routeAnchor?: RouteAnchor;
  /**
   * Absolute X of vertical segments that participate in an intersection.
   * These stay fixed when machines move (no percentage interpolation).
   * Prefer `lockedVerticals` (includes which vertical); this list is legacy.
   */
  lockedVerticalXs?: number[];
  /**
   * Intersection locks with vertical ordinal (0 = first V, 1 = second V, …)
   * so a free vertical approaching the lock cannot steal it.
   */
  lockedVerticals?: LockedVertical[];
  /**
   * Shared routing: ordered segment ids from the canvas routing graph.
   * When set, the edge is drawn via those segments (not a private polyline).
   */
  routePath?: string[];
  suggested?: boolean;
};

export function isItemEdgeData(data: unknown): data is ItemEdgeData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as ItemEdgeData).itemId === "string"
  );
}

export function getEdgeBendX(data: unknown): number | undefined {
  if (!isItemEdgeData(data)) return undefined;
  const v = data.bendX;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function getEdgeCorners(data: unknown): OrthoPoint[] | undefined {
  if (!isItemEdgeData(data)) return undefined;
  const c = data.corners;
  if (!Array.isArray(c) || c.length < 2) return undefined;
  const out: OrthoPoint[] = [];
  for (const p of c) {
    if (
      typeof p?.x === "number" &&
      typeof p?.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y)
    ) {
      out.push({ x: p.x, y: p.y });
    }
  }
  return out.length >= 2 ? out : undefined;
}

export function getEdgeCornersNorm(data: unknown): OrthoNorm[] | undefined {
  if (!isItemEdgeData(data)) return undefined;
  const c = data.cornersNorm;
  if (!Array.isArray(c) || c.length < 2) return undefined;
  const out: OrthoNorm[] = [];
  for (const p of c) {
    if (
      typeof p?.u === "number" &&
      typeof p?.v === "number" &&
      Number.isFinite(p.u) &&
      Number.isFinite(p.v)
    ) {
      out.push({ u: p.u, v: p.v });
    }
  }
  return out.length >= 2 ? out : undefined;
}

export function getRouteAnchor(data: unknown): RouteAnchor | undefined {
  if (!isItemEdgeData(data)) return undefined;
  const a = data.routeAnchor;
  if (!a) return undefined;
  if (
    typeof a.sx === "number" &&
    typeof a.sy === "number" &&
    typeof a.tx === "number" &&
    typeof a.ty === "number" &&
    Number.isFinite(a.sx) &&
    Number.isFinite(a.sy) &&
    Number.isFinite(a.tx) &&
    Number.isFinite(a.ty)
  ) {
    return { sx: a.sx, sy: a.sy, tx: a.tx, ty: a.ty };
  }
  return undefined;
}

export function getLockedVerticalXs(data: unknown): number[] {
  return getLockedVerticals(data).map((l) => l.x);
}

export function getLockedVerticals(data: unknown): LockedVertical[] {
  if (!isItemEdgeData(data)) return [];
  const full = data.lockedVerticals;
  if (Array.isArray(full) && full.length > 0) {
    const out: LockedVertical[] = [];
    for (const item of full) {
      if (
        typeof item?.x === "number" &&
        Number.isFinite(item.x) &&
        typeof item?.ord === "number" &&
        Number.isFinite(item.ord) &&
        item.ord >= 0
      ) {
        out.push({ x: item.x, ord: Math.floor(item.ord) });
      }
    }
    if (out.length > 0) return out;
  }
  // Legacy: Xs only — ordinal filled in at apply time by nearest match
  const xs = data.lockedVerticalXs;
  if (!Array.isArray(xs)) return [];
  return xs
    .filter((x) => typeof x === "number" && Number.isFinite(x))
    .map((x) => ({ x, ord: -1 }));
}
