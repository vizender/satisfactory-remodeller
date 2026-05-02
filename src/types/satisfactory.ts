/** Recette telle que stockée dans Assets/recipes.json (une entrée du tableau). */
export interface RecipeEntry {
  className: string;
  name: string;
  unlockedBy: string;
  duration: number;
  ingredients: { item: string; amount: number }[];
  products: { item: string; amount: number }[];
  producedIn: string[];
  inCraftBench: boolean;
  inWorkshop: boolean;
  inBuildGun: boolean;
  inCustomizer: boolean;
  manualCraftingMultiplier: number;
  alternate: boolean;
  minPower: number | null;
  maxPower: number | null;
  seasons: string[];
  stable: boolean;
  experimental: boolean;
}

/** Fichier complet : clé = className de recette, valeur = variantes. */
export type RecipesFile = Record<string, RecipeEntry[]>;

/** Index aplati pour l’app (généré). */
export interface RecipeIndexEntry extends RecipeEntry {
  recipeKey: string;
}

export interface RecipeIndex {
  generatedAt: string;
  count: number;
  recipes: RecipeIndexEntry[];
}
