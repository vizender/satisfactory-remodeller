/** Résultat du solveur de débits (chaînes DAG, splits proportionnels). */
export interface FlowSolveResult {
  machineMultiplier: Record<string, number>;
  effectiveRate: Record<string, number>;
  edgeFlow: Record<string, number>;
  /** + surplus (vert), − déficit (rouge) vs besoin local après répartition. */
  portDelta: Record<string, number>;
  hardConflict: boolean;
  /** Machines hors système soluble sans retirer des contraintes. */
  conflictMachineIds: string[];
  /** Liaisons incidentes aux ports en conflit (débits forcés incompatibles ou non satisfaits). */
  conflictEdgeIds: string[];
  /** Ports impliqués dans un conflit (entrées / sorties forcées). */
  conflictPortIds: string[];
  errorMessage: string | null;
}
