/**
 * Fichiers PNG explicites quand le libellé jeu / wiki ne coïncident pas.
 * Clés : `Desc_*_C`, valeurs : nom de fichier dans `Assets/icons/items/`.
 */
export const ITEM_ICON_FILE_OVERRIDES: Record<string, string> = {
  /** Wiki / recettes : `Screws.png`, pas « Iron_Screw ». */
  Desc_IronScrew_C: "Screws.png",
  /** Fluide wiki `Dark_Matter_Residue.png` (classe `Desc_DarkEnergy_C`). */
  Desc_DarkEnergy_C: "Dark_Matter_Residue.png",
  /** Recette « Synthetic Power Shard » → même item que les autres power shards. */
  Desc_CrystalShard_C: "Power_Shard.png",
  /** Wiki / jeu : visuel proche de « Reanimated SAM », pas « SAM_Fluctuator ». */
  Desc_SAMFluctuator_C: "Reanimated_SAM.png",
  /** Pas de « Snow.png » dans les assets ; « Actual_Snow » correspond au contenu FICSMAS. */
  Desc_Snow_C: "Actual_Snow.png",
  /** Classe `SteelPlate` → visuel wiki `Steel_Beam.png` (pas « Steel_Plate »). */
  Desc_SteelPlate_C: "Steel_Beam.png",
  /** Classe `Cement` → visuel wiki `Concrete.png`. */
  Desc_Cement_C: "Concrete.png",
  /** Conserver `Reinforced_Steel_Plate.png` après le libellé « Reinforced Steel Plate ». */
  Desc_SteelPlateReinforced_C: "Reinforced_Steel_Plate.png",
  /** Item distinct de `Desc_SteelPlateReinforced_C`. */
  Desc_EncasedIndustrialBeam_C: "Encased_Industrial_Beam.png",
  /** Pas de `Caterium_Wire.png` local ; visuel wiki `Quickwire.png`. */
  Desc_HighSpeedWire_C: "Quickwire.png",
  Desc_CircuitBoardHighSpeed_C: "AI_Limiter.png",
  Desc_Gunpowder_C: "Black_Powder.png",
  Desc_NobeliskExplosive_C: "Nobelisk.png",
  Desc_NobeliskShockwave_C: "Pulse_Nobelisk.png",
  /** Le dump pointe souvent `Spiked_Rebar.png` ; le visuel jeu est `Iron_Rebar.png`. */
  Desc_SpikedRebar_C: "Iron_Rebar.png",
  Desc_Rebar_Spreadshot_C: "Shatter_Rebar.png",
  Desc_Rebar_Stunshot_C: "Stun_Rebar.png",
  /** Wiki `High-Speed_Connector.png` (tiret), pas `High_Speed_Connector`. */
  Desc_HighSpeedConnector_C: "High-Speed_Connector.png",
};
