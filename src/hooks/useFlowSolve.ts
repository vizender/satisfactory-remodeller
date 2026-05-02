import { useMemo } from "react";
import { computeFlowSolveSnapshot } from "@/lib/flowSolveSnapshot";
import { useDocumentStore } from "@/store/useDocumentStore";
import type { FlowSolveResult } from "@/types/flowSolve";

/** Résultat du solveur : dérivé du document (Zustand), un calcul par mise à jour cohérente. */
export function useFlowSolveResult(): FlowSolveResult {
  const nodes = useDocumentStore((s) => s.nodes);
  const edges = useDocumentStore((s) => s.edges);
  const forcedPortRates = useDocumentStore((s) => s.forcedPortRates);
  return useMemo(
    () => computeFlowSolveSnapshot(nodes, edges, forcedPortRates),
    [nodes, edges, forcedPortRates],
  );
}

/** Résultat du solveur + actions sur les débits forcés. */
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
