import type { RecipeIndexEntry } from "./satisfactory";

/** Données du cadre machine (parent des ports). */
export interface MachineFrameData extends Record<string, unknown> {
  label: string;
  recipeKey: string;
  /**
   * Surclock / underclock (%), 0–250. Absent = 100 %.
   * Les débits nominaux des ports sont à 100 % ; le solveur applique ce facteur.
   */
  clockPercent?: number;
  /**
   * Permutation optionnelle : index de recette (ordre recette) → index de créneau vertical (0 = haut).
   * Présent seulement quand il y a plusieurs entrées / sorties et qu’on a réordonné.
   */
  inputSlotByRecipeIndex?: number[];
  outputSlotByRecipeIndex?: number[];
}

/** Un port matière (nœud séparé pour connexions 1 item). */
export interface ItemPortData extends Record<string, unknown> {
  kind: "in" | "out";
  portIndex: number;
  itemId: string;
  displayName: string;
  perMinute: number;
  amountPerCraft: number;
  /** Nombre de ports sur ce côté (pour réordonnancement vertical). */
  slotsOnSide: number;
}

/** Reserved: boundary port on a factory (future cross-canvas flow). */
export interface BoundaryPortDef {
  id: string;
  itemId: string;
  displayName: string;
  linkedPortId?: string;
}

export interface FactoryBoundarySpecV1 {
  version: 1;
  inputs: BoundaryPortDef[];
  outputs: BoundaryPortDef[];
}

/** Reserved: factory node visual overrides. */
export interface FactoryAppearanceV1 {
  version: 1;
  accentColor?: string;
  iconId?: string;
  frameVariant?: string;
}

export interface FactoryFrameData extends Record<string, unknown> {
  label: string;
  boundary?: FactoryBoundarySpecV1;
  appearance?: FactoryAppearanceV1;
}

/**
 * Découpe une chaîne PascalCase/camelCase en mots (OreIron → Ore Iron).
 * Les identifiants avec underscores restent espacés par _.
 */
export function splitPascalTokens(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .trim();
}

/** Surcharges d’affichage (l’id jeu reste inchangé, ex. export / edges). */
const ITEM_DISPLAY_OVERRIDES: Record<string, string> = {
  /** Le jeu utilise `Desc_Stone_C` ; on affiche « Limestone » partout en UI. */
  Desc_Stone_C: "Limestone",
};

/**
 * Le dump jeu garde parfois « Gold » (ex. caterium) : en UI on affiche « Caterium ».
 */
function applyGoldToCateriumLabel(s: string): string {
  return s.replace(/\bGold\b/g, "Caterium");
}

/** Libellé lisible pour un `Desc_*_C` (Desc_OreIron_C → « Ore Iron »). */
export function formatItemClassId(id: string): string {
  const o = ITEM_DISPLAY_OVERRIDES[id];
  if (o) return o;
  const core = id.replace(/^Desc_/, "").replace(/_C$/, "");
  let base: string;
  if (core.includes("_")) {
    base = core.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  } else {
    base = splitPascalTokens(core);
  }
  return applyGoldToCateriumLabel(base);
}

export interface ItemRateRow {
  itemId: string;
  displayName: string;
  perMinute: number;
  amountPerCraft: number;
}

/** Débits par minute par ligne (1 machine à 100 %, vitesse normale). */
export function itemRatesForRecipe(r: RecipeIndexEntry): {
  inputs: ItemRateRow[];
  outputs: ItemRateRow[];
  craftsPerMinute: number;
} {
  const craftsPerMinute = 60 / r.duration;
  return {
    craftsPerMinute,
    inputs: r.ingredients.map((i) => ({
      itemId: i.item,
      displayName: formatItemClassId(i.item),
      perMinute: craftsPerMinute * i.amount,
      amountPerCraft: i.amount,
    })),
    outputs: r.products.map((p) => ({
      itemId: p.item,
      displayName: formatItemClassId(p.item),
      perMinute: craftsPerMinute * p.amount,
      amountPerCraft: p.amount,
    })),
  };
}

/** Ligne de texte unique (aperçu machine). */
export function recipeSummaryLines(r: RecipeIndexEntry): {
  ins: string;
  outs: string;
} {
  const ins = r.ingredients
    .map((i) => `${formatItemClassId(i.item)} ×${i.amount}`)
    .join(", ");
  const outs = r.products
    .map((p) => `${formatItemClassId(p.item)} ×${p.amount}`)
    .join(", ");
  return { ins, outs };
}
