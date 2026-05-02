# Assets (données Satisfactory)

Le scaffold initial du projet a écrasé ce dossier. **Restaurez** depuis votre sauvegarde ou dépôt :

- `recipes.json` — export complet des recettes (objet clé = `className`, tableau de recettes).
- `icons/items/` et `icons/buildings/` — PNG + `_manifest.json` (clé `Desc_*_C` ou libellé d’affichage → nom de fichier, ex. `Desc_OreIron_C` → `iron_ore.png`). Les PNG listés doivent exister à côté du manifest pour que l’icône s’affiche.

Un **extrait minimal** est fourni pour que `npm run gen:recipes` et l’app démarrent sans erreur. Remplacez par votre jeu complet dès que possible.

### Icônes (wiki)

Pour récupérer les PNG items + fluides + bâtiments depuis les catégories officielles :

`npm run download:icons`

Les fichiers vont dans `icons/items/` (items + fluides depuis wiki.gg) et `icons/buildings/` (Fandom). Relancer le script ignore les fichiers déjà présents. Variable optionnelle : `ICON_LIMIT=10` pour un test court.
