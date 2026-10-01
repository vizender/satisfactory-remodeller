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

- **Ctrl/Cmd + Z / Ctrl/Cmd + Y** : annuler / rétablir les modifications (également Ctrl/Cmd + Maj + Z pour rétablir). L’historique conserve jusqu’à 100 étapes pendant la session, y compris les liaisons, réglages et usines imbriquées. Un déplacement complet compte pour une étape. Les champs de texte gardent leur annulation native ; le zoom et la sélection ne créent pas d’étape.

- **Maj + clic** : ajouter ou retirer une machine, un conteneur ou une usine de la sélection. Déplacer une sélection déplace aussi ses liaisons internes.
- **Souris** : glisser sur le fond déplace le canvas ; **Maj + glisser** trace un rectangle de sélection. La molette zoome.
- **Trackpad** : glisser sur le fond trace un rectangle de sélection ; le défilement à deux doigts déplace le canvas et le pincement zoome. **Espace + glisser** ou **bouton du milieu + glisser** déplace aussi le canvas. Le mode Auto des paramètres adapte le défilement au périphérique détecté. Le dézoom maximal atteint 2 %.
- **Ctrl/Cmd + C, X, V** : copier, couper et coller la sélection, avec les réglages et les usines imbriquées. Copier une liaison seule inclut ses machines aux extrémités ; couper une liaison seule ne supprime pas les machines. Le presse-papiers du canvas reste disponible entre les usines pendant la session.
- **Machines / Overclock** : saisir une valeur ou utiliser les boutons ±1 machine / ±10 %. Les boutons rejoignent d’abord le prochain entier (machines) ou multiple de 10 % (overclock) dans le sens choisi. Le dernier réglage modifié détermine l’autre en conservant le débit calculé. Un nombre de machines insuffisant est ajusté au nombre nécessaire à 250 %.
- **Ports** : ○ libre, ● forcé, ≈ calculé depuis une autre cible ou lié à une contrainte ou une boucle, ! cible ajustée. Les infobulles expliquent chaque état ; les ports de machines et de blueprints peuvent recevoir une cible.
- **Clic droit sur un port** : ajouter une machine connectée ou déconnecter toutes ses liaisons. Changer la recette conserve les liaisons et cibles des items communs, du même côté.

## Usines et blueprints

À l’intérieur d’une usine, relier les machines aux connecteurs **Entrée de l’usine** (en haut à gauche) et **Sortie de l’usine** (en haut à droite) expose les items sur le canvas parent. Un connecteur libre supplémentaire apparaît après chaque connexion. Les débits d’une usine suivent les réglages internes ; ses ports permettent de raccorder les machines et les autres usines du parent.

Les usines avec des ports affichent leur consommation, leur nombre de machines et leurs éclats de puissance, en incluant les usines et blueprints imbriqués. Chaque machine physique utilise un éclat par tranche de 50 % au-dessus de 100 % : 130 % et 150 % nécessitent un éclat, 180 % deux, 250 % trois.

Le menu d’ajout par clic droit contient un onglet **Blueprints** pour créer un modèle, placer une copie ou importer/exporter un fichier JSON. Un blueprint contient des machines et des conteneurs, mais aucune usine ni aucun autre blueprint. Ses connecteurs fonctionnent comme ceux d’une usine.

Forcer un débit sur les ports extérieurs d’un blueprint calcule le nombre de copies nécessaires, **y compris les fractions** (par exemple 2,5). Le nombre et l’horloge des machines à l’intérieur restent inchangés. La quantité peut aussi être saisie directement ; le bouton de calcul automatique rend la main aux connexions. Le blueprint lui-même n’a pas d’overclock ni d’amplificateur.

Modifier une instance actualise le modèle proposé dans le menu. Les autres instances conservent leur contenu et affichent **Obsolète**. L’export depuis le clic droit d’une instance conserve sa propre version ; l’export depuis le menu Blueprints utilise le dernier modèle. La bibliothèque est sauvegardée avec le plan et ses modifications peuvent être annulées/rétablies.

## Développement

Prérequis : Node.js 22.12+ et npm.

```bash
npm ci
npm run dev
```

L’application est accessible sur `http://localhost:1420/` (ou le port suivant s’il est occupé).

| Commande                  | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `npm run dev`             | Serveur de développement et génération des recettes         |
| `npm run dev:browser`     | Serveur de développement avec ouverture du navigateur       |
| `npm test`                | Tests automatisés                                           |
| `npm run build`           | Vérification TypeScript et compilation du site dans `dist/` |
| `npm run preview`         | Aperçu local du site compilé                                |
| `npm run dev:routing-lab` | Environnement de développement du routage                   |
| `npm run gen:recipes`     | Régénération de l’index des recettes                        |

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
