# Données et icônes

Ce dossier contient les données Satisfactory utilisées par l’application.

- `recipes.json` : recettes regroupées par identifiant de classe.
- `icons/items/` : icônes des objets et des fluides.
- `icons/buildings/` : icônes des bâtiments.
- `_manifest.json`, dans chaque dossier d’icônes : correspondance entre identifiants ou libellés et noms de fichiers PNG.

## Génération

`npm run gen:recipes` transforme les recettes en index dans `src/generated/`, en appliquant les compléments et corrections de `src/data/`. Cette génération s’exécute aussi avant `npm run dev` et `npm run build`.

## Maintenance des icônes

- `npm run download:icons` : télécharge les icônes depuis les catégories wiki configurées dans `scripts/downloadWikiIcons.ts` ; les fichiers existants sont conservés. `ICON_LIMIT` limite le nombre de fichiers par catégorie.
- `npm run report:icons` : génère `reports/recipe-icons-report.md` pour vérifier la couverture des icônes.

Les PNG référencés par les manifests doivent être présents dans le même dossier. Les icônes sont chargées à la demande par l’application.

Les données et images du jeu restent la propriété de leurs ayants droit.
