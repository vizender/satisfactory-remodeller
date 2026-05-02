/**
 * Liste tous les items et machines référencés dans recipeIndex,
 * et vérifie si au moins un candidat PNG existe (même logique que l’app).
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listAllItemIconCandidateFilenames,
  listAllMachineIconCandidateFilenames,
  type ItemIconHint,
} from "../src/lib/itemIconCandidates.ts";
import type { RecipeIndex } from "../src/types/satisfactory.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function collectPngBasenames(dir: string): Set<string> {
  const set = new Set<string>();
  function walk(d: string): void {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".png")) set.add(name.toLowerCase());
    }
  }
  walk(dir);
  return set;
}

function firstResolved(
  candidates: string[],
  pngSet: Set<string>,
): string | null {
  for (const c of candidates) {
    if (pngSet.has(c.toLowerCase())) return c;
  }
  return null;
}

const itemsDir = join(root, "Assets", "icons", "items");
const buildingsDir = join(root, "Assets", "icons", "buildings");
const itemPngs = collectPngBasenames(itemsDir);
const buildingPngs = collectPngBasenames(buildingsDir);

const indexPath = join(root, "src", "generated", "recipeIndex.json");
const index = JSON.parse(readFileSync(indexPath, "utf-8")) as RecipeIndex;

const itemIds = new Set<string>();
const machineIds = new Set<string>();

for (const r of index.recipes) {
  for (const ing of r.ingredients) itemIds.add(ing.item);
  for (const p of r.products) itemIds.add(p.item);
  for (const m of r.producedIn) machineIds.add(m);
}

/** Première recette (ordre index) qui produit l’item : même contexte que la liste de recettes. */
const productHintByItem = new Map<string, ItemIconHint>();
for (const r of index.recipes) {
  for (const p of r.products) {
    if (!productHintByItem.has(p.item)) {
      productHintByItem.set(p.item, {
        recipeName: r.name,
        alternate: r.alternate,
        singleOutputFallback: r.products.length === 1,
      });
    }
  }
}

type Row = { id: string; resolved: string | null; candidatesTried: number };

function reportItems(): Row[] {
  const rows: Row[] = [];
  for (const id of [...itemIds].sort()) {
    const base = productHintByItem.get(id);
    const cands = listAllItemIconCandidateFilenames(id, {
      ...base,
      /** Couverture max (recette canonique) pour le rapport, indépendamment du nb de sorties. */
      singleOutputFallback: true,
    });
    const hit = firstResolved(cands, itemPngs);
    rows.push({ id, resolved: hit, candidatesTried: cands.length });
  }
  return rows;
}

function reportMachines(): Row[] {
  const rows: Row[] = [];
  for (const id of [...machineIds].sort()) {
    const cands = listAllMachineIconCandidateFilenames(id);
    const hit = firstResolved(cands, buildingPngs);
    rows.push({ id, resolved: hit, candidatesTried: cands.length });
  }
  return rows;
}

const itemRows = reportItems();
const machineRows = reportMachines();

const itemsMissing = itemRows.filter((r) => r.resolved === null);
const machinesMissing = machineRows.filter((r) => r.resolved === null);

const outDir = join(root, "reports");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "recipe-icons-report.md");

const lines: string[] = [
  `# Rapport icônes (recettes)`,
  ``,
  `Généré à partir de \`src/generated/recipeIndex.json\` (${index.count} recettes).`,
  `Indice recette : **première** recette productrice dans l’index ; en dernier recours, \`itemPreferredRecipeHint.json\` (recette non-alt privilégiée si elle existe). Ce rapport active toujours ce fallback pour mesurer la couverture des PNG ; l’UI ne l’active que pour les recettes à **une seule** sortie.`,
  ``,
  `## Résumé`,
  ``,
  `| Catégorie | Total | Avec icône | Sans icône |`,
  `| --- | ---: | ---: | ---: |`,
  `| Items (ingrédients + produits) | ${itemRows.length} | ${itemRows.length - itemsMissing.length} | ${itemsMissing.length} |`,
  `| Machines (\`producedIn\`) | ${machineRows.length} | ${machineRows.length - machinesMissing.length} | ${machinesMissing.length} |`,
  ``,
];

if (itemsMissing.length > 0) {
  lines.push(`## Items sans PNG résolu`, ``);
  for (const r of itemsMissing) {
    lines.push(`- \`${r.id}\` (${r.candidatesTried} candidats essayés)`);
  }
  lines.push(``);
}

if (machinesMissing.length > 0) {
  lines.push(`## Machines sans PNG résolu`, ``);
  for (const r of machinesMissing) {
    lines.push(`- \`${r.id}\` (${r.candidatesTried} candidats essayés)`);
  }
  lines.push(``);
}

lines.push(`## Liste complète des items`, ``);
lines.push(`| Item class | Fichier PNG |`);
lines.push(`| --- | --- |`);
for (const r of itemRows) {
  lines.push(`| \`${r.id}\` | ${r.resolved ?? "—"} |`);
}
lines.push(``);

lines.push(`## Liste complète des machines (\`producedIn\`)`, ``);
lines.push(`| Machine class | Fichier PNG |`);
lines.push(`| --- | --- |`);
for (const r of machineRows) {
  lines.push(`| \`${r.id}\` | ${r.resolved ?? "—"} |`);
}

writeFileSync(outFile, lines.join("\n"), "utf-8");
console.log(`Wrote ${outFile}`);
console.log(
  `Items: ${itemsMissing.length} missing / ${itemRows.length}; Machines: ${machinesMissing.length} missing / ${machineRows.length}`,
);
