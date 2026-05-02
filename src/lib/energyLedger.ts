import type { Edge, Node } from "@xyflow/react";
import { generatorSpec, nominalConsumerMw } from "@/data/buildingPower";
import { clampClockPercent } from "@/lib/clockSpeed";
import { findRecipeByKey } from "@/lib/recipeLookup";
import { solveFlow } from "@/lib/flowSolver";
import { consumerPowerMwAtClock } from "@/lib/powerCalculations";
import type { MachineFrameData } from "@/types/graph";

export type EnergyLedger = {
  /**
   * Somme des conso réelles : pour chaque ligne, m (solveur) × P(horloge) par machine.
   */
  consumerTotalMw: number;
  /**
   * Équivalent « m machines à 100 % pour le même débit » : m × (horloge/100) × MW nominal
   * (puissance si la production actuelle était assurée par des bâtiments à 100 %, échelle linéaire).
   */
  consumerBaseline100Mw: number;
  /** Σ m × max(0, P − nominal) : surconsommation liée à l’overclock (> 100 %). */
  overclockExtraMw: number;
  /** Σ m × max(0, nominal − P) : « économie » underclock vs fiche 100 %. */
  underclockSavedMw: number;
  /** Nombre de bâtiments générateurs reconnus sur le graphe. */
  generatorCount: number;
  /** Somme des puissances nominales max (sortie) par type de générateur. */
  generatorCapacityMw: number;
};

export function computeEnergyLedger(
  nodes: Node[],
  edges: Edge[],
  forcedPortRates: Record<string, number | undefined>,
): EnergyLedger {
  const { machineMultiplier: multByMachine } = solveFlow(
    nodes,
    edges,
    forcedPortRates,
  );

  let consumerTotalMw = 0;
  let consumerBaseline100Mw = 0;
  let overclockExtraMw = 0;
  let underclockSavedMw = 0;
  let generatorCount = 0;
  let generatorCapacityMw = 0;

  for (const n of nodes) {
    if (n.type !== "machineFrame") continue;
    const d = n.data as MachineFrameData;
    const recipe = findRecipeByKey(d.recipeKey);
    const mid = recipe?.producedIn?.[0];
    if (!mid) continue;

    const nom = nominalConsumerMw(mid);
    if (nom !== undefined) {
      const m = multByMachine[n.id] ?? 1;
      const P = consumerPowerMwAtClock(nom, d.clockPercent);
      const c = clampClockPercent(d.clockPercent) / 100;
      consumerTotalMw += m * P;
      consumerBaseline100Mw += m * c * nom;
      if (P > nom) overclockExtraMw += m * (P - nom);
      else if (P < nom) underclockSavedMw += m * (nom - P);
      continue;
    }

    const g = generatorSpec(mid);
    if (g) {
      generatorCount += 1;
      generatorCapacityMw += g.powerMw;
    }
  }

  return {
    consumerTotalMw,
    consumerBaseline100Mw,
    overclockExtraMw,
    underclockSavedMw,
    generatorCount,
    generatorCapacityMw,
  };
}
