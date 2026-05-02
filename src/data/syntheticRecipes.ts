import type { RecipeIndexEntry } from "../types/satisfactory";

/**
 * Recettes « logiques » absentes du dump Satisfactory : extraction minière (sans entrée)
 * et générateurs (consommation sans sortie d’item).
 * Fusionnées dans l’index par `scripts/generateRecipeIndex.ts`.
 */
const S = {
  unlockedBy: "Remodeller — recettes dérivées",
  inCraftBench: false,
  inWorkshop: false,
  inBuildGun: false,
  inCustomizer: false,
  manualCraftingMultiplier: 1,
  alternate: false,
  minPower: null,
  maxPower: null,
  seasons: [] as string[],
  stable: true,
  experimental: false,
} as const;

/** 60 items/min : `craftsPerMinute = 60 / duration` → duration 1 s, montant 1. */
const RATE_60_PER_MIN = 1;

function mk(
  className: string,
  name: string,
  producedIn: string,
  ingredients: { item: string; amount: number }[],
  products: { item: string; amount: number }[],
): RecipeIndexEntry {
  return {
    className,
    name,
    recipeKey: className,
    ...S,
    duration: RATE_60_PER_MIN,
    ingredients,
    products,
    producedIn: [producedIn],
  };
}

export const SYNTHETIC_RECIPES: RecipeIndexEntry[] = [
  mk(
    "Synthetic_MinerMk1_IronOre_C",
    "Miner Mk.1 — Iron Ore (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_OreIron_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_CopperOre_C",
    "Miner Mk.1 — Copper Ore (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_OreCopper_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_Limestone_C",
    "Miner Mk.1 — Limestone (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_Stone_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_Coal_C",
    "Miner Mk.1 — Coal (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_Coal_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_CateriumOre_C",
    "Miner Mk.1 — Caterium Ore (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_OreGold_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_RawQuartz_C",
    "Miner Mk.1 — Raw Quartz (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_RawQuartz_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_Sulfur_C",
    "Miner Mk.1 — Sulfur (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_Sulfur_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_Bauxite_C",
    "Miner Mk.1 — Bauxite (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_OreBauxite_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_Uranium_C",
    "Miner Mk.1 — Uranium (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_OreUranium_C", amount: 1 }],
  ),
  mk(
    "Synthetic_MinerMk1_SAM_C",
    "Miner Mk.1 — SAM (60/min)",
    "Desc_MinerMk1_C",
    [],
    [{ item: "Desc_SAM_C", amount: 1 }],
  ),
  mk(
    "Synthetic_GeneratorCoal_Consume_C",
    "Coal-Powered Generator — burn coal (60/min)",
    "Desc_GeneratorCoal_C",
    [{ item: "Desc_Coal_C", amount: 1 }],
    [],
  ),
  mk(
    "Synthetic_GeneratorFuel_Consume_C",
    "Fuel-Powered Generator — burn fuel (60/min)",
    "Desc_GeneratorFuel_C",
    [{ item: "Desc_LiquidFuel_C", amount: 1 }],
    [],
  ),
  mk(
    "Synthetic_GeneratorBiomass_Consume_C",
    "Biomass Burner — burn biomass (60/min)",
    "Desc_GeneratorBiomass_Automated_C",
    [{ item: "Desc_Biofuel_C", amount: 1 }],
    [],
  ),
];
