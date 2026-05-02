import { useFlowSolveResult } from "@/context/FlowSolveContext";
import { useDocumentStore } from "@/store/useDocumentStore";

/** Résultat du solveur + actions sur les débits forcés (un seul calcul par frame via context). */
export function useFlowSolve() {
  const result = useFlowSolveResult();
  const forcedPortRates = useDocumentStore((s) => s.forcedPortRates);
  const setForcedPortRate = useDocumentStore((s) => s.setForcedPortRate);
  const clearForcedOnMachine = useDocumentStore(
    (s) => s.clearForcedOnMachine,
  );

  return {
    ...result,
    forcedPortRates,
    setForcedPortRate,
    clearForcedOnMachine,
  };
}
