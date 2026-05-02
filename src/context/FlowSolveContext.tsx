import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { solveFlow } from "@/lib/flowSolver";
import type { FlowSolveResult } from "@/types/flowSolve";
import { useDocumentStore } from "@/store/useDocumentStore";

const FlowSolveContext = createContext<FlowSolveResult | null>(null);

export function FlowSolveProvider({ children }: { children: ReactNode }) {
  const nodes = useDocumentStore((s) => s.nodes);
  const edges = useDocumentStore((s) => s.edges);
  const forcedPortRates = useDocumentStore((s) => s.forcedPortRates);

  const value = useMemo((): FlowSolveResult => {
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
  }, [nodes, edges, forcedPortRates]);

  return (
    <FlowSolveContext.Provider value={value}>
      {children}
    </FlowSolveContext.Provider>
  );
}

export function useFlowSolveResult(): FlowSolveResult {
  const v = useContext(FlowSolveContext);
  if (!v) {
    throw new Error("useFlowSolveResult doit être sous FlowSolveProvider");
  }
  return v;
}
