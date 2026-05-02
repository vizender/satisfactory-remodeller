# Satisfactory : Remodeller

Application desktop (**Tauri 2 + React + Vite + TypeScript**) pour planifier des chaînes de production façon Satisfactory : canvas **React Flow**, état **Zustand**, solveur de flux sur le graphe (débits, multiplicateurs machines, bilan énergie).

**Version 1.0** — première release utilisable pour modéliser des lignes, horloges et consommation.

## Prérequis

- Node.js 20+
- Rust (`cargo` ; installé avec Tauri si besoin)
- macOS / Windows / Linux — développement testé sur macOS ; builds multiplateformes via `npm run tauri build`.

## Assets

Le dossier [`Assets/`](Assets/) doit contenir votre **`recipes.json`** complet et les **PNG** + `_manifest.json` (voir [`Assets/README.md`](Assets/README.md)).

Un **extrait minimal** est fourni pour démarrer : remplacez-le par votre export complet dès que possible.

## Scripts

| Commande | Rôle |
|----------|------|
| `npm install` | Dépendances |
| `npm run gen:recipes` | Lit `Assets/recipes.json` → `src/generated/recipeIndex.json` |
| `npm run dev` | App desktop avec hot reload (`tauri dev`) |
| `npm run dev:web` | Front Vite seul (navigateur, port par défaut Vite) |
| `npm run tauri build` | Binaire + installateur (`.app`, `.dmg`, etc. selon l’OS) |

`predev` et `prebuild` régénèrent l’index des recettes automatiquement.

## Structure utile

- `src/components/FlowCanvas.tsx` — graphe React Flow.
- `src/store/useDocumentStore.ts` — nœuds / arêtes Zustand.
- `src/lib/flowSolver.ts` — solveur de débits et multiplicateurs machines.
- `src/lib/energyLedger.ts` — bilan énergétique (conso × nombre de machines).
- `scripts/generateRecipeIndex.ts` — pipeline données recettes.

## Publier sur GitHub

Le dépôt peut être initialisé localement puis poussé :

```bash
git init
git add .
git commit -m "chore: Satisfactory Remodeller v1.0.0"
gh repo create satisfactory-remodeller --private --source=. --push
# ou : créer le dépôt vide sur github.com puis :
# git remote add origin https://github.com/<vous>/satisfactory-remodeller.git
# git branch -M main
# git push -u origin main
```

Assurez-vous que `.gitignore` exclut bien `node_modules/`, `dist/`, et `src-tauri/target/`.
