/**
 * Fichiers PNG explicites quand le libellé jeu / wiki ne coïncident pas.
 * Clés : `Desc_*_C`, valeurs : nom de fichier dans `Assets/icons/items/`.
 */
export const ITEM_ICON_FILE_OVERRIDES: Record<string, string> = {
  /** Recette « Synthetic Power Shard » → même item que les autres power shards. */
  Desc_CrystalShard_C: "Power_Shard.png",
  /** Wiki / jeu : visuel proche de « Reanimated SAM », pas « SAM_Fluctuator ». */
  Desc_SAMFluctuator_C: "Reanimated_SAM.png",
  /** Pas de « Snow.png » dans les assets ; « Actual_Snow » correspond au contenu FICSMAS. */
  Desc_Snow_C: "Actual_Snow.png",
};
