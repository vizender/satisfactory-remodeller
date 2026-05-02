# Satisfactory : Remodeller

Application desktop (**Tauri 2 + React + Vite + TypeScript**) pour planifier des chaînes de production façon Satisfactory : canvas **React Flow**, état **Zustand**, solveur de flux (débits, multiplicateurs machines, bilan énergie).

**Auteur / maintenance :** **vizender** · **Licence :** [MIT](LICENSE) (voir ci-dessous).

---

## Installation sans ligne de commande (Mac & Windows)

Une fois les installateurs publiés (section **Releases** du dépôt GitHub) :

### macOS

1. Téléchargez le fichier **`.dmg`** (ex. `Satisfactory : Remodeller_*_universal.dmg` ou équivalent selon l’architecture).
2. Ouvrez le DMG (double-clic).
3. Glissez **Satisfactory : Remodeller** dans le dossier **Applications**.
4. Lancez l’app depuis **Applications** ou Spotlight — **aucun terminal requis**.

> Si Gatekeeper bloque l’app la première fois : **Réglages système → Confidentialité et sécurité** → autoriser, ou clic droit → **Ouvrir**.

### Windows

1. Téléchargez l’installateur **`.exe`** (installateur NSIS généré par Tauri).
2. Double-cliquez pour lancer l’assistant d’installation.
3. À la fin, lancez l’app depuis le menu Démarrer ou le raccourci bureau — **pas besoin de PowerShell ou CMD**.

Les artefacts exacts se trouvent sous :

`src-tauri/target/release/bundle/` après un build local (chemins typiques : sous-dossiers `dmg/`, `nsis/`).

---

## Prérequis pour **construire** le projet (développeurs)

- **Node.js** 20+
- **Rust** (`cargo` ; [rustup](https://rustup.rs/) recommandé)
- **macOS** : Xcode Command Line Tools (pour les bundles `.app` / `.dmg`).
- **Windows** : Visual Studio Build Tools + WebView2 (souvent déjà présent) ; l’installateur NSIS est utilisé par défaut par Tauri.

Les installateurs **Mac** se construisent sur une machine **macOS** ; les installateurs **Windows** sur **Windows** (ou via CI dédiée). Il n’existe pas d’unique fichier universel : publiez une build par OS dans les Releases.

---

## Assets données jeu

Le dossier [`Assets/`](Assets/) doit contenir votre **`recipes.json`** complet et les **PNG** + `_manifest.json` (voir [`Assets/README.md`](Assets/README.md)).

Un extrait minimal peut être fourni pour démarrer ; remplacez-le par votre export complet pour une utilisation réelle.

---

## Scripts npm

| Commande | Rôle |
|----------|------|
| `npm install` | Dépendances |
| `npm run gen:recipes` | Lit `Assets/recipes.json` → `src/generated/recipeIndex.json` |
| `npm run dev` | Application desktop avec rechargement à chaud (`tauri dev`) |
| `npm run dev:web` | Front Vite seul dans le navigateur |
| `npm run build` | Compilation TypeScript + bundle web (`dist/`) |
| `npm run build:desktop` | Build **Tauri** : binaire + **installateur** pour l’OS courant (`tauri build`) |

`predev` et `prebuild` régénèrent l’index des recettes automatiquement.

---

## Structure utile du code

- `src/components/FlowCanvas.tsx` — graphe React Flow.
- `src/store/useDocumentStore.ts` — nœuds / arêtes Zustand.
- `src/lib/flowSolver.ts` — solveur de débits et multiplicateurs machines.
- `src/lib/energyLedger.ts` — bilan énergétique (conso × nombre de machines).
- `scripts/generateRecipeIndex.ts` — pipeline des recettes.

---

## Licence et mentions légales

### MIT (code de cette application)

Le code source de **Satisfactory : Remodeller** est sous licence **MIT**. Voir le fichier [`LICENSE`](LICENSE).

Copyright © 2026 **vizender**.

### Satisfactory (jeu)

**Satisfactory** est une marque déposée par **Coffee Stain Studios AB**. Ce projet est un outil **non officiel** et **non affilié** aux éditeurs du jeu. Les données de recettes / icônes que vous placez dans `Assets/` restent soumises aux conditions d’usage du jeu et de vos propres exports.

### Dépendances

Les bibliothèques tierces (React, Tauri, etc.) sont soumises à **leurs** licences respectives ; consultez `package.json`, `Cargo.lock` et la documentation des crates npm.

---

## Publier des binaires (résumé)

1. Sur **macOS** : `npm run build:desktop` → déposer le `.dmg` (et éventuellement le `.app`) dans une **Release** GitHub.
2. Sur **Windows** : même commande → déposer le `.exe` NSIS.
3. Décrire dans la release la version, la checksum optionnelle, et le lien vers ce README pour la licence.
