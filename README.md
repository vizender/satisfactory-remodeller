# Satisfactory : Remodeller

Planificateur d’usines pour Satisfactory, accessible dans le navigateur.

**[Ouvrir l’application](https://satisfactoryremodeller.com/)**

## Fonctionnalités

- Organisation des usines et des machines sur un canvas interactif.
- Connexion des flux de production et sélection des recettes.
- Calcul des débits, des multiplicateurs de machines et du bilan énergétique.
- Import et export des plans au format JSON.
- Interface en français et en anglais, avec tutoriel intégré.

## Calcul des débits

Forcer une entrée ou une sortie recalcule les machines connectées dans les deux sens. En cas de manque, les objectifs les plus en aval sont prioritaires. Les débits imposés en amont restent respectés lorsqu’ils permettent un équilibre ou un surplus.

- Les surplus restent visibles en vert ; les déficits impossibles à résoudre apparaissent en rouge.
- Une cible ajustée reste enregistrée dans le champ de saisie, avec un badge indiquant l’ajustement et le débit calculé au-dessus.
- Les retours de production alimentent leur boucle avant les apports externes.
- Les branches suivent les besoins imposés ; les débits encore libres se répartissent aussi également que possible en items/min.
- Les conteneurs transmettent les débits et stockent les excédents.

Dans une même recette ou boucle, les sorties forcées sont prioritaires sur les entrées. Des cibles de même priorité incompatibles partagent l’écart relatif. L’ordre des saisies ne change pas les priorités. Une entrée sans liaison représente un apport externe disponible.

## Canvas et réglages

- **Maj + clic** : ajouter ou retirer une machine, un conteneur ou une usine de la sélection. Déplacer une sélection déplace aussi ses liaisons internes.
- **Ctrl/Cmd + C, X, V** : copier, couper et coller la sélection, avec les réglages et les usines imbriquées. Copier une liaison seule inclut ses machines aux extrémités ; couper une liaison seule ne supprime pas les machines. Le presse-papiers du canvas reste disponible entre les usines pendant la session.
- **Machines / Overclock** : saisir une valeur ou utiliser les boutons ±1 machine / ±10 %. Les boutons rejoignent d’abord le prochain entier (machines) ou multiple de 10 % (overclock) dans le sens choisi. Le dernier réglage modifié détermine l’autre en conservant le débit calculé. Un nombre de machines insuffisant est ajusté au nombre nécessaire à 250 %.
- **Ports** : ○ libre, ● forcé, ≈ calculé depuis une autre cible ou lié à une contrainte ou une boucle, ! cible ajustée. Les infobulles expliquent chaque état ; tous les ports peuvent recevoir une cible.
- **Clic droit sur un port** : ajouter une machine connectée ou déconnecter toutes ses liaisons. Changer la recette conserve les liaisons et cibles des items communs, du même côté.

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
