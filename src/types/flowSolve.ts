/** Résultat du solveur de débits : cascades, répartitions et recyclage. */
export interface FlowSolveResult {
  machineMultiplier: Record<string, number>;
  effectiveRate: Record<string, number>;
  edgeFlow: Record<string, number>;
  /** + surplus (vert), − déficit (rouge) vs besoin local après répartition. */
  portDelta: Record<string, number>;
  /** Forced targets adjusted to satisfy downstream demand; requested rates stay saved. */
  overriddenPortIds: string[];
  hardConflict: boolean;
  /** Machines hors système soluble sans retirer des contraintes. */
  conflictMachineIds: string[];
  /** Liaisons incidentes aux ports en conflit (débits forcés incompatibles ou non satisfaits). */
  conflictEdgeIds: string[];
  /** Ports impliqués dans un conflit (entrées / sorties forcées). */
  conflictPortIds: string[];
  /** Stockage net (items/min) par port d’entrée de conteneur. */
  portStoredPerMin: Record<string, number>;
  errorMessage: string | null;
}
