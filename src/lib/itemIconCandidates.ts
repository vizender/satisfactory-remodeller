import { formatMachineGroupLabel } from "@/lib/recipeFilters";
import { BUILDING_ICON_FILE_OVERRIDES } from "@/lib/buildingIconOverrides";
import { ITEM_ICON_FILE_OVERRIDES } from "@/lib/iconFileOverrides";
import { formatItemClassId } from "@/types/graph";
import itemManifest from "../../Assets/icons/items/_manifest.json";
import buildingManifest from "../../Assets/icons/buildings/_manifest.json";
import itemPreferredRecipeHint from "../generated/itemPreferredRecipeHint.json";

type FileMap = { files: Record<string, string> };

/** Contexte optionnel (ex. liste de recettes) pour dériver des noms de fichier wiki. */
export type ItemIconHint = {
  recipeName?: string;
  alternate?: boolean;
  /**
   * Recette à sortie unique : en dernier recours, essaie le nom d’une autre recette
   * productrice de l’item (souvent non-alt, voir `itemPreferredRecipeHint.json`).
   */
  singleOutputFallback?: boolean;
};

function firstFilename(
  m: FileMap,
  keys: (string | null | undefined)[],
): string | null {
  for (const k of keys) {
    if (!k) continue;
    const f = m.files[k];
    if (f) return f;
  }
  return null;
}

/** Retire les segments « ( … ) » (ex. « Biomass (Mycelia) » → « Biomass »). */
export function stripItemDisplayParentheticals(label: string): string {
  return label
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function labelToUnderscoreAndCompactPng(label: string): string[] {
  const t = label.trim();
  if (!t) return [];
  return [
    `${t.replace(/ /g, "_")}.png`,
    `${t.replace(/\s+/g, "")}.png`,
  ];
}

/**
 * Recettes alt : le wiki reprend souvent le nom « de base » en suffixe
 * (ex. « Adhered Iron Plate » → « Iron Plate » → Iron_Plate.png).
 */
function alternateRecipeSuffixCandidates(recipeNameNoParen: string): string[] {
  const words = recipeNameNoParen.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  if (words.length <= 1) return out;
  for (let k = 1; k < words.length; k++) {
    const suffix = words.slice(k).join(" ");
    out.push(...labelToUnderscoreAndCompactPng(suffix));
  }
  return out;
}

/** Nom « plein » après retrait des parenthèses (prioritaire pour Biomass, etc.). */
function recipeHintDirectCandidates(hint?: ItemIconHint): string[] {
  if (!hint?.recipeName?.trim()) return [];
  const noParen = stripItemDisplayParentheticals(hint.recipeName.trim());
  if (!noParen) return [];
  return labelToUnderscoreAndCompactPng(noParen);
}

/**
 * Suffixes de recettes alt (ex. « Iron Plate ») — **après** les heuristiques sur l’id item,
 * sinon `Iron_Plate.png` masque `Reinforced_Iron_Plate.png` pour les produits renforcés.
 */
function recipeHintAlternateSuffixCandidates(hint?: ItemIconHint): string[] {
  if (!hint?.recipeName?.trim() || !hint.alternate) return [];
  const noParen = stripItemDisplayParentheticals(hint.recipeName.trim());
  if (!noParen) return [];
  return alternateRecipeSuffixCandidates(noParen);
}

type PreferredRecipe = { recipeName: string; alternate: boolean };

function canonicalRecipeIconCandidates(
  itemId: string,
  hint?: ItemIconHint,
): string[] {
  if (!hint?.singleOutputFallback) return [];
  const map = itemPreferredRecipeHint as Record<string, PreferredRecipe>;
  const preferred = map[itemId];
  if (!preferred) return [];
  if (
    hint.recipeName !== undefined &&
    preferred.recipeName === hint.recipeName &&
    preferred.alternate === hint.alternate
  ) {
    return [];
  }
  const pseudo: ItemIconHint = {
    recipeName: preferred.recipeName,
    alternate: preferred.alternate,
  };
  return [
    ...recipeHintDirectCandidates(pseudo),
    ...recipeHintAlternateSuffixCandidates(pseudo),
  ];
}

/** « Iron Plate Reinforced » (Pascal dump) → fichier wiki « Reinforced_Iron_Plate.png ». */
function reinforcedWikiFilenameVariants(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];
  const last = words[words.length - 1]!;
  if (last.toLowerCase() !== "reinforced") return [];
  const base = words.slice(0, -1).join("_");
  return [`Reinforced_${base}.png`];
}

function expandDisplayLabelVariants(label: string): string[] {
  const out = new Set<string>();
  out.add(label);
  const noParen = stripItemDisplayParentheticals(label);
  if (noParen) out.add(noParen);
  if (/^generic\s+/i.test(label)) {
    out.add(label.replace(/^generic\s+/i, "").trim());
  }
  return [...out].filter(Boolean);
}

function heuristicItemFilenames(itemId: string, label: string): string[] {
  const names: string[] = [];

  for (const variant of expandDisplayLabelVariants(label)) {
    names.push(...labelToUnderscoreAndCompactPng(variant));
    names.push(...reinforcedWikiFilenameVariants(variant));

    const ore = /^Ore\s+(.+)$/i.exec(variant);
    if (ore) {
      const rest = ore[1].trim().replace(/\s+/g, "_");
      // Wiki : souvent « Uranium.png » plutôt que « Uranium_Ore.png » ; le fer reste via « Iron_Ore.png ».
      names.push(`${rest}.png`);
      if (rest.includes("_")) {
        names.push(`${rest.replace(/_/g, "")}.png`);
      }
      names.push(`${rest}_Ore.png`);
    }

    const liquid = /^Liquid\s+(.+)$/i.exec(variant);
    if (liquid) {
      const rest = liquid[1].trim().replace(/\s+/g, "_");
      const firstWord = liquid[1].trim().split(/\s+/)[0] ?? "";
      names.push(`${rest}.png`);
      if (rest.includes("_")) {
        names.push(`${rest.replace(/_/g, "")}.png`);
      }
      names.push(`Liquid_${rest}.png`);
      if (/^oil$/i.test(firstWord) && !liquid[1].trim().includes(" ")) {
        names.push("Crude_Oil.png");
      }
    }

    const raw = /^Raw\s+(.+)$/i.exec(variant);
    if (raw) {
      names.push(`Raw_${raw[1].trim().replace(/\s+/g, "_")}.png`);
    }
  }

  const core = itemId.replace(/^Desc_/, "").replace(/_C$/, "");
  if (core.includes("_")) {
    names.push(`${core}.png`);
  }

  if (/\bcanister\b/i.test(label) || /canister/i.test(itemId)) {
    names.push("Empty_Canister.png");
  }

  return names;
}

/** Tous les noms de fichier PNG essayés pour un item, dans l’ordre (pour résolution + rapport). */
export function listAllItemIconCandidateFilenames(
  itemId: string,
  hint?: ItemIconHint,
): string[] {
  const display = formatItemClassId(itemId);
  const out: string[] = [];

  const forced = ITEM_ICON_FILE_OVERRIDES[itemId];
  if (forced) out.push(forced);

  const mapped = firstFilename(itemManifest as FileMap, [itemId, display]);
  if (mapped) out.push(mapped);

  out.push(...recipeHintDirectCandidates(hint));

  out.push(...heuristicItemFilenames(itemId, display));

  out.push(...recipeHintAlternateSuffixCandidates(hint));

  out.push(...canonicalRecipeIconCandidates(itemId, hint));

  return [...new Set(out)];
}

function heuristicMachineFilenames(label: string): string[] {
  return [
    `${label.replace(/\s+/g, "_")}.png`,
    `${label.replace(/\s+/g, "")}.png`,
  ];
}

/** Tous les noms de fichier PNG essayés pour une classe de machine `Desc_*_C`. */
export function listAllMachineIconCandidateFilenames(
  machineClassId: string,
): string[] {
  const label = formatMachineGroupLabel(machineClassId);
  const out: string[] = [];

  const forcedB = BUILDING_ICON_FILE_OVERRIDES[machineClassId];
  if (forcedB) out.push(forcedB);

  const mapped = firstFilename(buildingManifest as FileMap, [
    machineClassId,
    label,
  ]);
  if (mapped) out.push(mapped);

  out.push(...heuristicMachineFilenames(label));

  return [...new Set(out)];
}
