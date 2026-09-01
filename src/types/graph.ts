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

export type ContainerVariant = "standard" | "industrial";

/** Cadre conteneur (stockage / point de terminaison de chaîne). */
export interface ContainerFrameData extends Record<string, unknown> {
  label: string;
  variant: ContainerVariant;
  /** Si faux : sorties inactives (bouchon de chaîne). */
  outputEnabled: boolean;
  /** Classe bâtiment pour l’icône (`Desc_StorageContainerMk*`). */
  buildingClassId: string;
}

/** Port sans item encore relié (connexion définira l’item). */
export const CONTAINER_UNASSIGNED_ITEM = "";

export function isPortItemAssigned(itemId: string): boolean {
  return itemId.length > 0;
}

export function portItemsCompatible(
  a: string,
  b: string,
): boolean {
  if (a === b) return true;
  if (!isPortItemAssigned(a) || !isPortItemAssigned(b)) return true;
  return false;
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
  /** Classe `IronScrew` → libellé wiki / recettes « Screws ». */
  Desc_IronScrew_C: "Screws",
  /** Classe interne `DarkEnergy` ; fluide affiché « Dark Matter Residue ». */
  Desc_DarkEnergy_C: "Dark Matter Residue",
  /** Classe `SteelPlate` ; en jeu / wiki l’item s’appelle « Steel Beam ». */
  Desc_SteelPlate_C: "Steel Beam",
  /** Classe `Cement` ; en jeu / wiki l’item s’appelle « Concrete ». */
  Desc_Cement_C: "Concrete",
  /** Classe `SteelPlateReinforced` ; distinct de « Encased Industrial Beam ». */
  Desc_SteelPlateReinforced_C: "Reinforced Steel Plate",
  /** Produit de `Recipe_EncasedIndustrialBeam_C` (pas `Desc_SteelPlateReinforced_C`). */
  Desc_EncasedIndustrialBeam_C: "Encased Industrial Beam",
  /** Classe `HighSpeedWire` ; libellé demandé « Caterium Wire » (wiki actuel : Quickwire). */
  Desc_HighSpeedWire_C: "Caterium Wire",
  /** Classe `CircuitBoardHighSpeed` ; en jeu / wiki « AI Limiter ». */
  Desc_CircuitBoardHighSpeed_C: "AI Limiter",
  /** Classe `Gunpowder` ; en jeu / wiki « Black Powder ». */
  Desc_Gunpowder_C: "Black Powder",
  /** Classe `NobeliskExplosive` ; en jeu l’item s’appelle « Nobelisk ». */
  Desc_NobeliskExplosive_C: "Nobelisk",
  /** Classe `NobeliskShockwave` ; en jeu / wiki « Pulse Nobelisk ». */
  Desc_NobeliskShockwave_C: "Pulse Nobelisk",
  /** Classe `SpikedRebar` ; en jeu / wiki « Iron Rebar ». */
  Desc_SpikedRebar_C: "Iron Rebar",
  /** Classe `Rebar_Spreadshot` ; en jeu / wiki « Shatter Rebar ». */
  Desc_Rebar_Spreadshot_C: "Shatter Rebar",
  /** Classe `Rebar_Stunshot` ; en jeu / wiki « Stun Rebar ». */
  Desc_Rebar_Stunshot_C: "Stun Rebar",
  /** Classe `HighSpeedConnector` ; wiki / recette « High-Speed Connector ». */
  Desc_HighSpeedConnector_C: "High-Speed Connector",
};

/**
 * Le dump jeu garde parfois « Gold » (ex. caterium) : en UI on affiche « Caterium ».
 */
function applyGoldToCateriumLabel(s: string): string {
  return s.replace(/\bGold\b/g, "Caterium");
}

/** Surcharge d’affichage explicite, ou `undefined` si le libellé est heuristique. */
export function itemDisplayOverride(id: string): string | undefined {
  return ITEM_DISPLAY_OVERRIDES[id];
}

/** Libellé lisible pour un `Desc_*_C` (Desc_OreIron_C → « Ore Iron »). */
export function formatItemClassId(id: string): string {
  const o = itemDisplayOverride(id);
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

/** Libellé port / UI : toujours dérivé de l’id item (pas du `displayName` persisté). */
export function itemPortDisplayName(
  itemId: string,
  storedDisplayName?: string,
): string {
  if (!isPortItemAssigned(itemId)) {
    const s = storedDisplayName?.trim();
    return s && s !== "—" ? s : "—";
  }
  return formatItemClassId(itemId);
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
