import { hvIntersection } from "./geometry";
import type { RouteGraph } from "./types";

/**
 * 15 strokes for nets. Mid-sat / mid-light so they read on both light and
 * dark canvases. Reds are omitted — conflict uses `--conflict-edge-stroke`.
 */
export const NET_PALETTE = [
  "#1d4ed8",
  "#0d9488",
  "#16a34a",
  "#a16207",
  "#6d28d9",
  "#0369a1",
  "#0f766e",
  "#4d7c0f",
  "#4338ca",
  "#b45309",
  "#0891b2",
  "#7c3aed",
  "#047857",
  "#1e3a8a",
  "#5b21b6",
] as const;

export const NET_PALETTE_SIZE = NET_PALETTE.length;

function addAdj(adj: Map<string, Set<string>>, a: string, b: string): void {
  if (a === b) return;
  let sa = adj.get(a);
  if (!sa) {
    sa = new Set();
    adj.set(a, sa);
  }
  sa.add(b);
  let sb = adj.get(b);
  if (!sb) {
    sb = new Set();
    adj.set(b, sb);
  }
  sb.add(a);
}

/** Undirected graph of nets whose H/V runs properly cross. */
export function crossingNetAdjacency(graph: RouteGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const byId = new Map(graph.vertices.map((v) => [v.id, v]));
  const segs = graph.segments;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!;
      const b = segs[j]!;
      if (a.netId === b.netId || a.axis === b.axis) continue;
      if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
      const h = a.axis === "h" ? a : b;
      const v = a.axis === "v" ? a : b;
      const ha = byId.get(h.a);
      const hb = byId.get(h.b);
      const va = byId.get(v.a);
      const vb = byId.get(v.b);
      if (!ha || !hb || !va || !vb) continue;
      if (!hvIntersection(ha, hb, va, vb)) continue;
      addAdj(adj, a.netId, b.netId);
    }
  }
  return adj;
}

/**
 * Greedy coloring in `netIds` order. Prefers a color unused by already-colored
 * crossing neighbors. If all 15 are taken, reuses the least-used neighbor color.
 */
export function colorNets(
  netIds: string[],
  neighbors: Map<string, Set<string>>,
): Map<string, string> {
  const assigned = new Map<string, number>();
  for (const id of netIds) {
    const used = new Set<number>();
    const counts = new Array<number>(NET_PALETTE_SIZE).fill(0);
    for (const n of neighbors.get(id) ?? []) {
      const c = assigned.get(n);
      if (c === undefined) continue;
      used.add(c);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    let pick = -1;
    for (let i = 0; i < NET_PALETTE_SIZE; i++) {
      if (!used.has(i)) {
        pick = i;
        break;
      }
    }
    if (pick < 0) {
      pick = 0;
      let best = Infinity;
      for (let i = 0; i < NET_PALETTE_SIZE; i++) {
        const n = counts[i] ?? 0;
        if (n < best) {
          best = n;
          pick = i;
        }
      }
    }
    assigned.set(id, pick);
  }
  const out = new Map<string, string>();
  for (const [id, i] of assigned) {
    out.set(id, NET_PALETTE[i]!);
  }
  return out;
}

export function assignNetColors(graph: RouteGraph): Map<string, string> {
  return colorNets(
    graph.nets.map((n) => n.id),
    crossingNetAdjacency(graph),
  );
}
