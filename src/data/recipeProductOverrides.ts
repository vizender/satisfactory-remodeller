/**
 * Produits dump à remplacer pour une recette précise (l’id jeu des autres recettes
 * reste inchangé). Clé = `recipeKey` / `className`.
 */
export const RECIPE_PRODUCT_ITEM_OVERRIDES: Record<
  string,
  { from: string; to: string }
> = {
  /** Dump : Encased Industrial Beam → `Desc_SteelPlateReinforced_C` (Reinforced Steel Plate). */
  Recipe_EncasedIndustrialBeam_C: {
    from: "Desc_SteelPlateReinforced_C",
    to: "Desc_EncasedIndustrialBeam_C",
  },
};
