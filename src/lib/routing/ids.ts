import type { RouteGraph } from "./types";

let next = 1;

export function resetRouteIds(start = 1): void {
  next = start;
}

export function vid(): string {
  return `rv${next++}`;
}

export function sid(): string {
  return `rs${next++}`;
}

export function nid(): string {
  return `rn${next++}`;
}

/** After loading a persisted graph, keep new ids unique. */
export function syncRouteIds(graph: RouteGraph): void {
  let max = 0;
  const bump = (id: string) => {
    const m = /^(?:rv|rs|rn)(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  };
  for (const v of graph.vertices) bump(v.id);
  for (const s of graph.segments) bump(s.id);
  for (const n of graph.nets) bump(n.id);
  next = max + 1;
}
