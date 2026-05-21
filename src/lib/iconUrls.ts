import {
  listAllItemIconCandidateFilenames,
  listAllMachineIconCandidateFilenames,
  type ItemIconHint,
} from "@/lib/itemIconCandidates";
import type { RecipeIndexEntry } from "@/types/satisfactory";

type IconLoader = () => Promise<string>;

const itemPngLoaders = import.meta.glob<string>(
  "../../Assets/icons/items/**/*.png",
  { query: "?url", import: "default" },
) as Record<string, IconLoader>;

const buildingPngLoaders = import.meta.glob<string>(
  "../../Assets/icons/buildings/**/*.png",
  { query: "?url", import: "default" },
) as Record<string, IconLoader>;

function mapBasenameToLoader(
  glob: Record<string, IconLoader>,
): Map<string, IconLoader> {
  const m = new Map<string, IconLoader>();
  for (const [path, loader] of Object.entries(glob)) {
    const base = path.split("/").pop();
    if (base) m.set(base.toLowerCase(), loader);
  }
  return m;
}

const itemByBasename = mapBasenameToLoader(itemPngLoaders);
const buildingByBasename = mapBasenameToLoader(buildingPngLoaders);

const urlCache = new Map<string, Promise<string | null>>();

async function loadIconUrl(
  filename: string,
  byBase: Map<string, IconLoader>,
): Promise<string | null> {
  const key = filename.toLowerCase();
  const cached = urlCache.get(key);
  if (cached) return cached;

  const loader = byBase.get(key);
  if (!loader) return null;

  const promise = loader()
    .then((url) => url)
    .catch(() => null);
  urlCache.set(key, promise);
  return promise;
}

async function resolveFirstCandidate(
  filenames: string[],
  byBase: Map<string, IconLoader>,
): Promise<string | null> {
  for (const name of filenames) {
    const u = await loadIconUrl(name, byBase);
    if (u) return u;
  }
  return null;
}

/**
 * URL Vite pour l’icône PNG d’un item (`Desc_*_C`), ou `null` si absente.
 */
export async function resolveItemIconUrl(
  itemId: string,
  hint?: ItemIconHint,
): Promise<string | null> {
  return resolveFirstCandidate(
    listAllItemIconCandidateFilenames(itemId, hint),
    itemByBasename,
  );
}

export type { ItemIconHint };

/**
 * URL pour une classe de machine Satisfactory (`Desc_*_C` dans `producedIn`).
 */
export async function resolveMachineIconUrl(
  machineClassId: string,
): Promise<string | null> {
  return resolveFirstCandidate(
    listAllMachineIconCandidateFilenames(machineClassId),
    buildingByBasename,
  );
}

/** Item représentatif pour l’aperçu d’une recette (produit principal ou premier ingrédient). */
export function recipeRepresentativeItemId(
  r: RecipeIndexEntry,
): string | null {
  if (r.products.length > 0) return r.products[0]!.item;
  if (r.ingredients.length > 0) return r.ingredients[0]!.item;
  return null;
}
