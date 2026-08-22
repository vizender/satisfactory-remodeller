/**
 * Lit Assets/recipes.json et produit src/generated/recipeIndex.json
 * (recherche par className, filtre alternate / producedIn côté app).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPE_PRODUCT_ITEM_OVERRIDES } from "../src/data/recipeProductOverrides";
import { SYNTHETIC_RECIPES } from "../src/data/syntheticRecipes";
import type { RecipeIndex, RecipeIndexEntry, RecipesFile } from "../src/types/satisfactory";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = join(root, "Assets", "recipes.json");
const outDir = join(root, "src", "generated");
const outFile = join(outDir, "recipeIndex.json");

const raw = readFileSync(source, "utf-8");
const data = JSON.parse(raw) as RecipesFile;

function applyProductOverride(
  recipeKey: string,
  r: RecipeIndexEntry,
): RecipeIndexEntry {
  const override = RECIPE_PRODUCT_ITEM_OVERRIDES[recipeKey];
  if (!override) return r;
  return {
    ...r,
    products: r.products.map((p) =>
      p.item === override.from ? { ...p, item: override.to } : p,
    ),
  };
}

const recipes: RecipeIndexEntry[] = [];
for (const [recipeKey, list] of Object.entries(data)) {
  if (!Array.isArray(list)) continue;
  for (const r of list) {
    recipes.push(applyProductOverride(recipeKey, { ...r, recipeKey }));
  }
}

recipes.push(...SYNTHETIC_RECIPES);

const index: RecipeIndex = {
  generatedAt: new Date().toISOString(),
  count: recipes.length,
  recipes,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(index, null, 0), "utf-8");
console.log(`Wrote ${index.count} recipes to ${outFile}`);

/** Recettes synthétiques : noms peu wiki ; exclus du choix « canonique » pour les icônes. */
const recipesForPreferredIcon = recipes.filter(
  (r) => !r.className.startsWith("Synthetic_"),
);

const byProductItem = new Map<string, RecipeIndexEntry[]>();
for (const r of recipesForPreferredIcon) {
  for (const p of r.products) {
    let list = byProductItem.get(p.item);
    if (!list) {
      list = [];
      byProductItem.set(p.item, list);
    }
    list.push(r);
  }
}

function compareRecipesForPreferredIcon(
  a: RecipeIndexEntry,
  b: RecipeIndexEntry,
): number {
  if (a.alternate !== b.alternate) return a.alternate ? 1 : -1;
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.name.localeCompare(b.name);
}

const itemPreferredRecipeHint: Record<
  string,
  { recipeName: string; alternate: boolean }
> = {};
for (const [itemId, list] of byProductItem) {
  const sorted = [...list].sort(compareRecipesForPreferredIcon);
  const best = sorted[0]!;
  itemPreferredRecipeHint[itemId] = {
    recipeName: best.name,
    alternate: best.alternate,
  };
}

const hintPath = join(outDir, "itemPreferredRecipeHint.json");
writeFileSync(hintPath, JSON.stringify(itemPreferredRecipeHint, null, 0), "utf-8");
console.log(
  `Wrote ${Object.keys(itemPreferredRecipeHint).length} item preferred recipe hints to ${hintPath}`,
);
