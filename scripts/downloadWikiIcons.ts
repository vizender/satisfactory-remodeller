/**
 * Télécharge les icônes depuis les catégories wiki via l’API MediaWiki
 * (plus fiable que le parsing HTML des pages Category).
 *
 * Items : https://satisfactory.wiki.gg/wiki/Category:Item_icons
 * Fluides : https://satisfactory.wiki.gg/wiki/Category:Fluid_icons → même dossier que les items
 * Machines : https://satisfactory.fandom.com/wiki/Category:Building_icons
 *
 * Usage : npx tsx scripts/downloadWikiIcons.ts
 * Test rapide (5 fichiers max par catégorie) : ICON_LIMIT=5 npx tsx scripts/downloadWikiIcons.ts
 */
import { mkdirSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const ITEM_DIR = join(root, "Assets", "icons", "items");
const BUILDING_DIR = join(root, "Assets", "icons", "buildings");

const UA =
  "SatisfactoryRemodeller/1.0 (local asset sync; contact: project maintainer)";

type WikiApiResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        missing?: string;
        imageinfo?: { url: string; mime?: string }[];
      }
    >;
  };
  continue?: Record<string, string>;
  error?: { code?: string; info?: string };
};

/** Titre `File:Foo Bar.png` → nom de fichier sûr (évite `'` et caractères exotiques). */
function diskNameFromFileTitle(fileTitle: string): string {
  const withoutNs = fileTitle.replace(/^File:/i, "");
  return withoutNs
    .replace(/['"]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()]/g, "_")
    .replace(/_+/g, "_");
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<WikiApiResponse> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}…`);
  }
  return res.json() as Promise<WikiApiResponse>;
}

/**
 * Liste tous les membres « fichier » d’une catégorie avec URL complète (original).
 */
async function listCategoryFilesWithUrls(
  apiBase: string,
  categoryTitle: string,
): Promise<{ title: string; url: string }[]> {
  const out: { title: string; url: string }[] = [];
  /** MediaWiki renvoie souvent plusieurs clés (`gcmcontinue`, `continue`, …) à réinjecter telles quelles. */
  let continueParams: Record<string, string> | undefined;

  for (;;) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "categorymembers",
      gcmtitle: categoryTitle,
      gcmnamespace: "6",
      gcmlimit: "500",
      prop: "imageinfo",
      iiprop: "url",
    });
    if (continueParams) {
      for (const [k, v] of Object.entries(continueParams)) {
        params.set(k, v);
      }
    }

    const url = `${apiBase}?${params.toString()}`;
    const data = await fetchJson(url);

    if (data.error) {
      throw new Error(
        `API error: ${data.error.code ?? "?"} — ${data.error.info ?? ""}`,
      );
    }

    const pages = data.query?.pages;
    if (pages) {
      for (const page of Object.values(pages)) {
        const title = page.title;
        const info = page.imageinfo?.[0];
        if (!title || !info?.url || page.missing) continue;
        out.push({ title, url: info.url });
      }
    }

    const cont = data.continue;
    if (!cont || Object.keys(cont).length === 0) break;
    continueParams = cont as Record<string, string>;
    await sleep(350);
  }

  return out;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  mkdirSync(dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
}

async function main() {
  const limit =
    process.env.ICON_LIMIT !== undefined && process.env.ICON_LIMIT !== ""
      ? Number.parseInt(process.env.ICON_LIMIT, 10)
      : 0;

  mkdirSync(ITEM_DIR, { recursive: true });
  mkdirSync(BUILDING_DIR, { recursive: true });

  const wikiGg = "https://satisfactory.wiki.gg/api.php";
  const fandom = "https://satisfactory.fandom.com/api.php";

  console.log("Liste des fichiers : Category:Item_icons (wiki.gg)…");
  let items = await listCategoryFilesWithUrls(wikiGg, "Category:Item_icons");
  console.log(`  → ${items.length} fichiers`);

  console.log("Liste des fichiers : Category:Fluid_icons (wiki.gg)…");
  let fluids = await listCategoryFilesWithUrls(
    wikiGg,
    "Category:Fluid_icons",
  );
  console.log(`  → ${fluids.length} fichiers`);

  console.log("Liste des fichiers : Category:Building_icons (fandom)…");
  let buildings = await listCategoryFilesWithUrls(
    fandom,
    "Category:Building_icons",
  );
  console.log(`  → ${buildings.length} fichiers`);

  if (limit > 0) {
    items = items.slice(0, limit);
    fluids = fluids.slice(0, limit);
    buildings = buildings.slice(0, limit);
    console.log(`\nICON_LIMIT=${limit} — téléchargement partiel uniquement.\n`);
  }

  let dl = 0;
  let skip = 0;
  let err = 0;

  async function processBatch(
    entries: { title: string; url: string }[],
    dir: string,
    label: string,
  ) {
    for (const { title, url } of entries) {
      const diskName = diskNameFromFileTitle(title);
      const dest = join(dir, diskName);
      if (existsSync(dest)) {
        skip++;
        continue;
      }
      try {
        await downloadToFile(url, dest);
        dl++;
        if (dl % 25 === 0) console.log(`  ${label} téléchargés : ${dl}…`);
        await sleep(120);
      } catch (e) {
        err++;
        console.warn(
          `  Échec ${diskName}:`,
          e instanceof Error ? e.message : e,
        );
        await sleep(500);
      }
    }
  }

  await processBatch(items, ITEM_DIR, "items");
  await processBatch(fluids, ITEM_DIR, "fluides");
  await processBatch(buildings, BUILDING_DIR, "bâtiments");

  console.log(
    `\nTerminé. Nouveaux : ${dl}, déjà présents (ignorés) : ${skip}, erreurs : ${err}`,
  );
  console.log(`Items      → ${ITEM_DIR}`);
  console.log(`Bâtiments  → ${BUILDING_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
