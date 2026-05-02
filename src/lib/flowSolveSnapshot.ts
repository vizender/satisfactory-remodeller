import type { Edge, Node } from "@xyflow/react";
import { solveFlow } from "@/lib/flowSolver";
import type { FlowSolveResult } from "@/types/flowSolve";

/**
 * Exécute le solveur avec gestion d’erreur — même logique qu’avant via provider,
 * mais utilisable depuis un hook branché sur Zustand (pas de Context = pas de casse HMR).
 */
export function computeFlowSolveSnapshot(
  nodes: Node[],
  edges: Edge[],
  forcedPortRates: Record<string, number | undefined>,
): FlowSolveResult {
  try {
    return solveFlow(nodes, edges, forcedPortRates);
  } catch (e) {
    console.error("solveFlow:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      machineMultiplier: {},
      effectiveRate: {},
      edgeFlow: {},
      portDelta: {},
      hardConflict: true,
      conflictMachineIds: [],
      errorMessage:
        msg ||
        "Erreur interne du solveur — vérifiez les nœuds et les liaisons.",
    };
  }
}
