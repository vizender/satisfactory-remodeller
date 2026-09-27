import type { Edge, Node } from "@xyflow/react";
import { solveFlow } from "@/lib/flowSolver";
import type { FlowSolveResult } from "@/types/flowSolve";

// Every port/frame subscribes to the same immutable document. Share its solve instead
// of optimizing the complete factory again for each rendered port. Old graphs are GC'd.
const snapshots = new WeakMap<
  Node[],
  {
    edges: Edge[];
    forced: Record<string, number | undefined>;
    result: FlowSolveResult;
  }
>();

/** Shared solver result with error handling for the current document snapshot. */
export function computeFlowSolveSnapshot(
  nodes: Node[],
  edges: Edge[],
  forcedPortRates: Record<string, number | undefined>,
): FlowSolveResult {
  const cached = snapshots.get(nodes);
  if (cached?.edges === edges && cached.forced === forcedPortRates)
    return cached.result;
  let result: FlowSolveResult;
  try {
    result = solveFlow(nodes, edges, forcedPortRates);
  } catch (e) {
    console.error("solveFlow:", e);
    const msg = e instanceof Error ? e.message : String(e);
    result = {
      machineMultiplier: {},
      effectiveRate: {},
      edgeFlow: {},
      portDelta: {},
      hardConflict: true,
      overriddenPortIds: [],
      conflictMachineIds: [],
      conflictEdgeIds: [],
      conflictPortIds: [],
      portStoredPerMin: {},
      errorMessage:
        msg ||
        "Erreur interne du solveur — vérifiez les nœuds et les liaisons.",
    };
  }
  snapshots.set(nodes, { edges, forced: forcedPortRates, result });
  return result;
}
