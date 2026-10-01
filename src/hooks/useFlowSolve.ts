import { useFactoryHierarchy } from "@/hooks/useFactoryHierarchy";
import { useWorldStore } from "@/store/useWorldStore";
import { useDocumentStore } from "@/store/useDocumentStore";
import type { FlowSolveResult } from "@/types/flowSolve";

export function useFlowSolveResult(): FlowSolveResult {
  const active = useWorldStore((s) => s.activeCanvasId);
  return useFactoryHierarchy().results[active];
}

/** Résultat du solveur + actions sur les débits forcés. */
export function useFlowSolve() {
  const result = useFlowSolveResult();
  const forcedPortRates = useDocumentStore((s) => s.forcedPortRates);
  const setForcedPortRate = useDocumentStore((s) => s.setForcedPortRate);
  const clearForcedOnMachine = useDocumentStore((s) => s.clearForcedOnMachine);

  return {
    ...result,
    forcedPortRates,
    setForcedPortRate,
    clearForcedOnMachine,
  };
}
