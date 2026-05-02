/**
 * Modèle électrique : la conso nominale est liée au **type de bâtiment** (`producedIn[0]`),
 * pas à la recette. Les **générateurs** (production + combustibles / modes) sont dans
 * `generatorBuildings.ts` ; le bilan (sommes / signes) viendra plus tard.
 */

/** Identifiant de classe Satisfactory (`Desc_*_C`, `Build_*_C`, …). */
export type BuildingClassId = string;

/** Item (`Desc_*_C`) — entrée ou sortie d’un générateur. */
export type FuelItemId = string;

/**
 * Puissance consommée à 100 % d’horloge, **sans** amplification Somersloop ni surclock
 * (MW). Table `CONSUMER_NOMINAL_MW_BY_BUILDING`.
 */
export type ConsumerNominalMwByBuilding = Partial<
  Record<BuildingClassId, number>
>;

/** Débit pour un item (solide : /min ; fluides du générateur carburant : m³/min côté wiki). */
export type GeneratorIoRate = {
  itemId: FuelItemId;
  perMinute: number;
};

/**
 * Un mode d’exploitation : une combinaison de combustibles / une « recette » de brûlage
 * (ex. barre uranium + eau → déchets).
 */
export type GeneratorOperatingMode = {
  /** Clé stable (tests, UI). */
  key: string;
  inputs: GeneratorIoRate[];
  outputs: GeneratorIoRate[];
};

/**
 * Définition d’un générateur : **puissance fixe** pour le bâtiment ; vitesses de flux
 * différentes selon le combustible / le mode.
 */
export type GeneratorBuildingSpec = {
  classId: BuildingClassId;
  /** MW produits (identiques pour chaque mode de ce bâtiment). */
  powerMw: number;
  modes: GeneratorOperatingMode[];
};
