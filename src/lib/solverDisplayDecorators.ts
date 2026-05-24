import type { Edge } from "@xyflow/react";

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Marque les liaisons impliquées dans un conflit de débit forcé. */
export function applySolverConflictToEdges(
  edges: Edge[],
  conflictEdgeIds: readonly string[],
): Edge[] {
  if (conflictEdgeIds.length === 0) return edges;
  const set = new Set(conflictEdgeIds);
  return edges.map((e) => {
    if (!set.has(e.id)) return e;
    return {
      ...e,
      className: cn(e.className, "rf-edge-conflict"),
      zIndex: 1001,
    };
  });
}
