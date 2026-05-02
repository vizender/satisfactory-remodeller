import recipeIndex from "@/generated/recipeIndex.json";
import type { RecipeIndex, RecipeIndexEntry } from "@/types/satisfactory";

const index = recipeIndex as RecipeIndex;

/** Noms d’affichage préférés (l’id jeu `Desc_*_C` reste inchangé pour les flux / icônes). */
const MACHINE_GROUP_LABEL_OVERRIDES: Record<string, string> = {
  Desc_OilRefinery_C: "Oil Refinery",
  Desc_HadronCollider_C: "Particle Accelerator",
  Desc_GeneratorBiomass_Automated_C: "Biomass Burner",
  Desc_GeneratorCoal_C: "Coal-Powered Generator",
  Desc_GeneratorFuel_C: "Fuel-Powered Generator",
  Desc_GeneratorNuclear_C: "Nuclear Reactor",
};

/** Recettes de placement / sans machine de craft (`producedIn` vide) — ex. bâtiment dans le mode placement ; on les exclut de l’UI recettes. */
export function isPlacementRecipe(r: RecipeIndexEntry): boolean {
  return !r.producedIn?.length;
}

export function withoutPlacementRecipes(
  recipes: RecipeIndexEntry[],
): RecipeIndexEntry[] {
  return recipes.filter((r) => !isPlacementRecipe(r));
}

/** Groupe d’affichage : 1ʳᵉ machine `producedIn` (les recettes sans machine sont déjà filtrées). */
export function machineGroupKey(recipe: RecipeIndexEntry): string {
  const first = recipe.producedIn?.[0];
  return first && first.length > 0 ? first : "Unknown";
}

/** Libellé lisible pour un groupe (nom de classe Satisfactory). */
export function formatMachineGroupLabel(key: string): string {
  const o = MACHINE_GROUP_LABEL_OVERRIDES[key];
  if (o) return o;
  let s = key
    .replace(/^Desc_/, "")
    .replace(/^Build_/, "")
    .replace(/_C$/, "");
  // Repères de niveau (Mk1, Mk2…) — masqués à l’affichage.
  s = s.replace(/Mk\d+$/i, "");
  s = s.replace(/_/g, " ");
  // CamelCase / PascalCase : OilRefinery → Oil Refinery
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Nom d’instance machine affiché par défaut (ex. « Constructor » depuis `producedIn`),
 * distinct du titre de recette.
 */
export function defaultMachineInstanceLabel(
  recipe: RecipeIndexEntry | undefined,
  frameId: string,
): string {
  if (!recipe) return frameId;
  const k = recipe.producedIn?.[0];
  if (!k) return frameId;
  const name = formatMachineGroupLabel(k);
  return name.length > 0 ? name : frameId;
}

/** Toutes les clés `producedIn[0]` distinctes pour les recettes craft (hors placement). */
export function listCraftMachineGroupKeys(): string[] {
  const set = new Set<string>();
  for (const r of index.recipes) {
    if (isPlacementRecipe(r)) continue;
    const k = r.producedIn?.[0];
    if (k) set.add(k);
  }
  return [...set].sort((a, b) =>
    formatMachineGroupLabel(a).localeCompare(formatMachineGroupLabel(b)),
  );
}

/** Recettes dont un produit est `itemId` (ex. besoin amont depuis une entrée). */
export function recipesProducingItem(itemId: string): RecipeIndexEntry[] {
  return index.recipes.filter((r) =>
    r.products.some((p) => p.item === itemId),
  );
}

/** Recettes qui consomment `itemId` en ingrédient (ex. aval depuis une sortie). */
export function recipesConsumingItem(itemId: string): RecipeIndexEntry[] {
  return index.recipes.filter((r) =>
    r.ingredients.some((i) => i.item === itemId),
  );
}

export type RecipeFilter =
  | { mode: "none" }
  | { mode: "produces"; itemId: string }
  | { mode: "consumes"; itemId: string };

export function filterRecipes(f: RecipeFilter): RecipeIndexEntry[] {
  let list: RecipeIndexEntry[];
  if (f.mode === "none") list = [...index.recipes];
  else if (f.mode === "produces") list = recipesProducingItem(f.itemId);
  else list = recipesConsumingItem(f.itemId);
  return withoutPlacementRecipes(list);
}

/** Tri puis groupement par `machineGroupKey`, sous-listes triées par nom. */
export function groupRecipesByMachine(
  recipes: RecipeIndexEntry[],
): Map<string, RecipeIndexEntry[]> {
  const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  const map = new Map<string, RecipeIndexEntry[]>();
  for (const r of sorted) {
    const k = machineGroupKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const keys = [...map.keys()].sort((a, b) =>
    formatMachineGroupLabel(a).localeCompare(formatMachineGroupLabel(b)),
  );
  const ordered = new Map<string, RecipeIndexEntry[]>();
  for (const k of keys) ordered.set(k, map.get(k)!);
  return ordered;
}
