# Satisfactory : Remodeller

Planificateur d’usines pour Satisfactory, accessible dans le navigateur.

**[Ouvrir l’application](https://satisfactoryremodeller.com/)**

## Fonctionnalités

- Organisation des usines et des machines sur un canvas interactif.
- Connexion des flux de production et sélection des recettes.
- Calcul des débits, des multiplicateurs de machines et du bilan énergétique.
- Import et export des plans au format JSON.
- Interface en français et en anglais, avec tutoriel intégré.

## Développement

Prérequis : Node.js 22.12+ et npm.

```bash
npm ci
npm run dev
```

L’application est accessible sur `http://localhost:1420/` (ou le port suivant s’il est occupé).

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement et génération des recettes |
| `npm run dev:browser` | Serveur de développement avec ouverture du navigateur |
| `npm test` | Tests automatisés |
| `npm run build` | Vérification TypeScript et compilation du site dans `dist/` |
| `npm run preview` | Aperçu local du site compilé |
| `npm run dev:routing-lab` | Environnement de développement du routage |
| `npm run gen:recipes` | Régénération de l’index des recettes |

## Structure

L’application utilise React, TypeScript et Vite, avec React Flow pour le canvas et Zustand pour l’état.

- `src/components/` : interface et canvas.
- `src/store/` : état des plans et de l’interface.
- `src/lib/` : calcul des flux, routage et gestion des documents.
- `src/data/` : données complémentaires et corrections des recettes.
- `src/generated/` : index produits par le générateur de recettes.
- `Assets/` : [recettes et icônes](Assets/README.md).
- `scripts/` : génération des données et outils de maintenance.

## Licence

Code sous [licence MIT](LICENSE), © 2026 vizender.

Satisfactory est une marque de Coffee Stain Studios AB. Ce projet est non officiel et n’est pas affilié aux éditeurs du jeu. Les données et images du jeu restent soumises aux droits de leurs ayants droit. Les dépendances conservent leurs licences respectives.
