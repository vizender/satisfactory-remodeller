# Satisfactory : Remodeller

Planificateur d’usines Satisfactory (**React + Vite + TypeScript**) : canvas **React Flow**, état **Zustand**, solveur de flux (débits, multiplicateurs machines, bilan énergie). **Usage principal : navigateur** (Chrome, Safari). Une enveloppe **Tauri 2** optionnelle permet encore des installateurs desktop.

**Auteur / maintenance :** **vizender** · **Licence :** [MIT](LICENSE) (voir ci-dessous).

---

## Utilisation web (recommandé)

### Développement local

```bash
npm install
npm run dev:web          # http://localhost:1420/
npm run dev:browser      # idem + ouverture du navigateur
npm run build && npm run preview   # http://localhost:4173/
```

Dans l’en-tête, **Navigation → Auto / Trackpad / Souris** règle le défilement et le zoom du canvas (détection automatique ou forçage manuel).

**Clic droit (Safari / Chrome)** : sur le canvas, seuls les menus de l’app s’affichent (recette, machine, lien). Le champ de recherche du sélecteur de recettes garde le menu natif pour copier-coller.

### Déploiement Vercel (site personnel)

**URL de production :** [https://satisfactoryremodeller.com/](https://satisfactoryremodeller.com/)

1. Importer ce dépôt GitHub dans [Vercel](https://vercel.com).
2. Framework **Vite** ; répertoire racine `.` ; build `npm run build` ; sortie `dist` (voir aussi [`vercel.json`](vercel.json)).
3. Domaine personnalisé **`satisfactoryremodeller.com`** : ajouter le domaine dans Vercel → **Settings → Domains**, puis configurer les enregistrements DNS chez le registrar (Vercel affiche les valeurs A/CNAME à utiliser).
4. Chaque push sur la branche de production déclenche un déploiement ; les PR obtiennent une URL de preview.

Les icônes PNG sont chargées **à la demande** (pas tout le dossier `Assets/icons/` au premier chargement).

---

## Installateurs desktop (optionnel)

### Pourquoi il n’y a pas de `.dmg` ni de `.exe` dans ce dépôt ?

Les installateurs **ne sont pas versionnés dans Git** : ce seraient des fichiers lourds, spécifiques à chaque OS, et ils changent à chaque release. Le dépôt contient uniquement le **code source**.

Pour récupérer un **DMG** (macOS) ou un **installateur .exe** (Windows) :

1. **GitHub Actions** — onglet [**Actions**](https://github.com/vizender/satisfactory-remodeller/actions) : le workflow **Desktop installers** se lance à chaque push sur **`main`**, sur un tag **`v*`**, ou à la main (**Run workflow** à droite). Ouvrez le dernier run vert → en bas, section **Artifacts** : zip **Satisfactory-Remodeller_macOS** (`.dmg`) ou **Satisfactory-Remodeller_Windows** (`.exe`).  
   *Les artefacts Actions ont une durée de rétention limitée sur GitHub (souvent ~90 jours selon le plan).*

2. **Releases** — pour une version stable, créez une [**Release**](https://github.com/vizender/satisfactory-remodeller/releases) et **joignez** les mêmes fichiers (construits en CI ou en local), afin qu’ils restent disponibles sans limite de temps.

3. **Build locale** — voir `npm run build:desktop` ci-dessous ; les fichiers apparaissent dans `src-tauri/target/release/bundle/` (`dmg/`, `nsis/`, etc.).

---

## Installation sans ligne de commande (Mac & Windows)

Une fois que vous avez obtenu les installateurs (Actions, Release, ou build locale) :

### macOS

1. Téléchargez le fichier **`.dmg`** (nom du fichier typique : `Satisfactory Remodeller_*` — sans « : » dans le nom, contrainte des installateurs).
2. Ouvrez le DMG (double-clic).
3. Glissez **Satisfactory Remodeller.app** dans le dossier **Applications** (le titre de la fenêtre de l’app peut toujours afficher « Satisfactory : Remodeller »).
4. Lancez l’app depuis **Applications** ou Spotlight — **aucun terminal requis**.

> Si Gatekeeper bloque l’app la première fois : **Réglages système → Confidentialité et sécurité** → autoriser, ou clic droit → **Ouvrir**.

### Windows

1. Téléchargez l’installateur **`.exe`** (installateur NSIS généré par Tauri).
2. Double-cliquez pour lancer l’assistant d’installation.
3. À la fin, lancez l’app depuis le menu Démarrer ou le raccourci bureau — **pas besoin de PowerShell ou CMD**.

Après une **build locale**, les fichiers se trouvent sous `src-tauri/target/release/bundle/` (dossiers typiques `dmg/`, `nsis/`).

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
| `npm run dev:web` | Front Vite seul dans le navigateur (port 1420) |
| `npm run dev:browser` | Comme `dev:web` + ouverture du navigateur |
| `npm run preview` | Sert `dist/` en local après `npm run build` |
| `npm run build` | Compilation TypeScript + bundle web (`dist/`) — utilisé par Vercel |
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

## Publier une release (résumé)

1. Construire les installateurs : **CI** (workflow **Desktop installers**) ou **`npm run build:desktop`** sur chaque OS cible.
2. Joindre le `.dmg` et le `.exe` à une **Release** GitHub pour les garder accessibles longtemps.
3. Décrire la version, une checksum optionnelle, et renvoyer à ce README pour la licence.
