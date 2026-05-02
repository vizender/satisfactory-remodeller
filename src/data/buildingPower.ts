import type {
  BuildingClassId,
  ConsumerNominalMwByBuilding,
  GeneratorBuildingSpec,
} from "@/types/power";

import { GENERATOR_BUILDING_SPECS as _GENERATOR_SPECS } from "./generatorBuildings";

/**
 * Conso nominale (MW @ 100 % clock) par classe de **machine productive**
 * (Constructeur, Fonderie, etc.). Clés = `Desc_*_C` comme dans `producedIn[0]`.
 *
 * **Puissance variable (à traiter plus tard)** : `Desc_HadronCollider_C`, `Desc_QuantumEncoder_C`,
 * `Desc_Converter_C` (recettes `minPower` / `maxPower` dans l’index).
 */
export const CONSUMER_NOMINAL_MW_BY_BUILDING: ConsumerNominalMwByBuilding = {
  Desc_ConstructorMk1_C: 4,
  Desc_AssemblerMk1_C: 15,
  Desc_ManufacturerMk1_C: 55,
  Desc_Blender_C: 75,
  Desc_FoundryMk1_C: 16,
  Desc_MinerMk1_C: 5,
  Desc_MinerMk2_C: 15,
  Desc_MinerMk3_C: 45,
  /** Water Extractor — 20 MW @ 100 % (wiki Satisfactory). */
  Desc_WaterPump_C: 20,
  /** Oil Extractor — 40 MW @ 100 % (wiki Satisfactory). */
  Desc_OilPump_C: 40,
  Desc_OilRefinery_C: 30,
  Desc_SmelterMk1_C: 4,
  Desc_Packager_C: 10,
};

/** Voir `generatorBuildings.ts` (puissance, modes, débits /min). */
export const GENERATOR_BUILDING_SPECS: GeneratorBuildingSpec[] = _GENERATOR_SPECS;

export function nominalConsumerMw(
  machineClassId: BuildingClassId,
): number | undefined {
  return CONSUMER_NOMINAL_MW_BY_BUILDING[machineClassId];
}

export function generatorSpec(
  classId: BuildingClassId,
): GeneratorBuildingSpec | undefined {
  return GENERATOR_BUILDING_SPECS.find((g) => g.classId === classId);
}
