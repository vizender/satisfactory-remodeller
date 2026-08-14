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

/** Max attempts to fix same-color crossings (including trying the other net). */
export const COLOR_REPAIR_ITERS = 16;

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

function toHex(assigned: Map<string, number>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, i] of assigned) {
    out.set(id, NET_PALETTE[i]!);
  }
  return out;
}

function cloneAssigned(assigned: Map<string, number>): Map<string, number> {
  return new Map(assigned);
}

function restoreAssigned(
  assigned: Map<string, number>,
  snap: Map<string, number>,
): void {
  assigned.clear();
  for (const [id, c] of snap) assigned.set(id, c);
}

function usage(assigned: Map<string, number>): number[] {
  const u = new Array<number>(NET_PALETTE_SIZE).fill(0);
  for (const c of assigned.values()) u[c] = (u[c] ?? 0) + 1;
  return u;
}

function pickLeastUsed(
  candidates: number[],
  assigned: Map<string, number>,
): number {
  const u = usage(assigned);
  let best = candidates[0]!;
  let bestU = Infinity;
  for (const c of candidates) {
    const n = u[c] ?? 0;
    if (n < bestU || (n === bestU && c < best)) {
      bestU = n;
      best = c;
    }
  }
  return best;
}

function freeColors(
  id: string,
  assigned: Map<string, number>,
  neighbors: Map<string, Set<string>>,
): number[] {
  const used = new Set<number>();
  for (const n of neighbors.get(id) ?? []) {
    const c = assigned.get(n);
    if (c !== undefined) used.add(c);
  }
  const out: number[] = [];
  for (let i = 0; i < NET_PALETTE_SIZE; i++) {
    if (!used.has(i)) out.push(i);
  }
  return out;
}

function conflictPairs(
  netIds: string[],
  assigned: Map<string, number>,
  neighbors: Map<string, Set<string>>,
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const id of netIds) {
    for (const n of neighbors.get(id) ?? []) {
      if (id < n && assigned.get(id) === assigned.get(n)) {
        pairs.push([id, n]);
      }
    }
  }
  return pairs;
}

function conflictCount(
  netIds: string[],
  assigned: Map<string, number>,
  neighbors: Map<string, Set<string>>,
): number {
  return conflictPairs(netIds, assigned, neighbors).length;
}

function minConflictColor(
  id: string,
  assigned: Map<string, number>,
  neighbors: Map<string, Set<string>>,
): number {
  const counts = new Array<number>(NET_PALETTE_SIZE).fill(0);
  for (const n of neighbors.get(id) ?? []) {
    const c = assigned.get(n);
    if (c !== undefined) counts[c] = (counts[c] ?? 0) + 1;
  }
  const u = usage(assigned);
  const current = assigned.get(id) ?? 0;
  let best = current;
  let bestC = counts[best] ?? 0;
  let bestU = u[best] ?? 0;
  for (let i = 0; i < NET_PALETTE_SIZE; i++) {
    const cc = counts[i] ?? 0;
    const uu = u[i] ?? 0;
    if (
      cc < bestC ||
      (cc === bestC && uu < bestU) ||
      (cc === bestC && uu === bestU && i < best)
    ) {
      best = i;
      bestC = cc;
      bestU = uu;
    }
  }
  return best;
}

function laterFirst(
  a: string,
  b: string,
  indexOf: Map<string, number>,
): [string, string] {
  const ia = indexOf.get(a) ?? 0;
  const ib = indexOf.get(b) ?? 0;
  return ia <= ib ? [b, a] : [a, b];
}

/**
 * Give every net a distinct palette slot first (wrap after 15). Then, if two
 * crossing nets share a color, recolor one to a slot unused by its crossing
 * neighbors. If that would collide with another neighbor (a waterfall), try
 * the other net instead. After `COLOR_REPAIR_ITERS` attempts, keep the
 * assignment with the fewest remaining same-color crossings.
 */
export function colorNets(
  netIds: string[],
  neighbors: Map<string, Set<string>>,
): Map<string, string> {
  const assigned = new Map<string, number>();
  const indexOf = new Map<string, number>();
  netIds.forEach((id, i) => {
    indexOf.set(id, i);
    assigned.set(id, i % NET_PALETTE_SIZE);
  });

  let best = cloneAssigned(assigned);
  let bestScore = conflictCount(netIds, assigned, neighbors);

  for (let iter = 0; iter < COLOR_REPAIR_ITERS && bestScore > 0; iter++) {
    const pairs = conflictPairs(netIds, assigned, neighbors);
    if (pairs.length === 0) break;
    const [a, b] = pairs[0]!;
    const order = laterFirst(a, b, indexOf);

    let resolved = false;
    for (const node of order) {
      const free = freeColors(node, assigned, neighbors);
      if (free.length === 0) continue;
      assigned.set(node, pickLeastUsed(free, assigned));
      resolved = true;
      break;
    }

    if (!resolved) {
      restoreAssigned(assigned, best);
      let moved = false;
      for (const node of order) {
        const old = assigned.get(node);
        if (old === undefined) continue;
        const next = minConflictColor(node, assigned, neighbors);
        if (next === old) continue;
        assigned.set(node, next);
        const score = conflictCount(netIds, assigned, neighbors);
        if (score < bestScore) {
          moved = true;
          break;
        }
        assigned.set(node, old);
      }
      if (!moved) break;
    }

    const score = conflictCount(netIds, assigned, neighbors);
    if (score < bestScore) {
      bestScore = score;
      best = cloneAssigned(assigned);
    } else {
      restoreAssigned(assigned, best);
      break;
    }
  }

  return toHex(best);
}

export function assignNetColors(graph: RouteGraph): Map<string, string> {
  return colorNets(
    graph.nets.map((n) => n.id),
    crossingNetAdjacency(graph),
  );
}
