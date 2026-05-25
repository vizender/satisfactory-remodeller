/**
 * Fichiers PNG explicites quand le libellé dérivé de la classe ne matche pas le wiki.
 * Clés : `Desc_*_C` (comme `producedIn[0]`), valeurs : nom de fichier dans `Assets/icons/buildings/`.
 */
export const BUILDING_ICON_FILE_OVERRIDES: Record<string, string> = {
  /** Fichier wiki « Refinery.png », pas « Oil_Refinery.png ». */
  Desc_OilRefinery_C: "Refinery.png",
  /** Fichier local aligné sur le wiki (accélérateur de particules / Hadron). */
  Desc_HadronCollider_C: "Particle_Accelerator.png",
  Desc_GeneratorBiomass_Automated_C: "Biomass_Burner.png",
  Desc_GeneratorCoal_C: "Coal_Generator.png",
  Desc_GeneratorFuel_C: "Fuel_Generator.png",
  /** Libellé UI « Nuclear Reactor » ; asset wiki « Nuclear_Power_Plant ». */
  Desc_GeneratorNuclear_C: "Nuclear_Power_Plant.png",
  Desc_StorageContainerMk1_C: "Storage_Container.png",
  Desc_StorageContainerMk2_C: "Industrial_Storage_Container.png",
  Desc_QuantumEncoder_C: "Quantum_Encoder.png",
};
