import recipeIndex from "@/generated/recipeIndex.json";
import type { RecipeIndex, RecipeIndexEntry } from "@/types/satisfactory";

const index = recipeIndex as RecipeIndex;

export function findRecipeByKey(
  recipeKey: string | undefined,
): RecipeIndexEntry | null {
  if (!recipeKey) return null;
  return (
    index.recipes.find(
      (r) => r.recipeKey === recipeKey || r.className === recipeKey,
    ) ?? null
  );
}

