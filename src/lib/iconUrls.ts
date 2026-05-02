import {
  listAllItemIconCandidateFilenames,
  listAllMachineIconCandidateFilenames,
  type ItemIconHint,
} from "@/lib/itemIconCandidates";
import type { RecipeIndexEntry } from "@/types/satisfactory";

const itemPngs = import.meta.glob<string>("../../Assets/icons/items/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const buildingPngs = import.meta.glob<string>(
  "../../Assets/icons/buildings/**/*.png",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;

function mapBasenameToUrl(
  glob: Record<string, string>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, url] of Object.entries(glob)) {
    const base = path.split("/").pop();
    if (base) m.set(base.toLowerCase(), url);
  }
  return m;
}

const itemByBasename = mapBasenameToUrl(itemPngs);
const buildingByBasename = mapBasenameToUrl(buildingPngs);

function resolveFile(
  filename: string,
  byBase: Map<string, string>,
): string | null {
  const u = byBase.get(filename.toLowerCase());
  return u ?? null;
}

/**
 * URL Vite pour l’icône PNG d’un item (`Desc_*_C`), ou `null` si absente du manifest / disque.
 * `hint` (nom de recette, alt) améliore le matching wiki (biomasse, recettes alt, etc.).
 */
export function getItemIconUrl(
  itemId: string,
  hint?: ItemIconHint,
): string | null {
  for (const name of listAllItemIconCandidateFilenames(itemId, hint)) {
    const u = resolveFile(name, itemByBasename);
    if (u) return u;
  }
  return null;
}

export type { ItemIconHint };

/**
 * URL pour une classe de machine Satisfactory (`Desc_*_C` dans `producedIn`).
 */
export function getMachineIconUrl(machineClassId: string): string | null {
  for (const name of listAllMachineIconCandidateFilenames(machineClassId)) {
    const u = resolveFile(name, buildingByBasename);
    if (u) return u;
  }
  return null;
}

/** Item représentatif pour l’aperçu d’une recette (produit principal ou premier ingrédient). */
export function recipeRepresentativeItemId(
  r: RecipeIndexEntry,
): string | null {
  if (r.products.length > 0) return r.products[0]!.item;
  if (r.ingredients.length > 0) return r.ingredients[0]!.item;
  return null;
}
