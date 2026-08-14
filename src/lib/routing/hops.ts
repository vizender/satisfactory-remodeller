import { HOP_RADIUS } from "./constants";
import { hvIntersection } from "./geometry";
import type { CrossingHop, RouteGraph, RouteSegment, RouteVertex } from "./types";

function pt(v: RouteVertex) {
  return { x: v.x, y: v.y };
}

function verts(graph: RouteGraph) {
  return new Map(graph.vertices.map((v) => [v.id, v]));
}

function sharedVertex(a: RouteSegment, b: RouteSegment): boolean {
  return a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b;
}

/**
 * CAD hops at proper H/V crossings that do not already share a vertex.
 * The vertical segment always carries the arch so two nets never both hop.
 */
export function computeHops(graph: RouteGraph): CrossingHop[] {
  const byId = verts(graph);
  const hops: CrossingHop[] = [];
  const segs = graph.segments;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!;
      const b = segs[j]!;
      if (a.netId === b.netId) continue;
      if (sharedVertex(a, b)) continue;
      if (a.axis === b.axis) continue;
      const h = a.axis === "h" ? a : b;
      const v = a.axis === "v" ? a : b;
      const ha = byId.get(h.a);
      const hb = byId.get(h.b);
      const va = byId.get(v.a);
      const vb = byId.get(v.b);
      if (!ha || !hb || !va || !vb) continue;
      const hit = hvIntersection(pt(ha), pt(hb), pt(va), pt(vb));
      if (!hit) continue;
      hops.push({
        segmentId: v.id,
        x: hit.x,
        y: hit.y,
        axis: "v",
      });
    }
  }
  return hops;
}

export { HOP_RADIUS };
