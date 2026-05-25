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

/** `craftsPerMinute = 60 / duration` → montants = débits /min à 100 %. */
const RATE_NOMINAL_DURATION_S = 60;

function mk(
  className: string,
  name: string,
  producedIn: string,
  ingredients: { item: string; amount: number }[],
  products: { item: string; amount: number }[],
  duration = RATE_60_PER_MIN,
): RecipeIndexEntry {
  return {
    className,
    name,
    recipeKey: className,
    ...S,
    duration,
    ingredients,
    products,
    producedIn: [producedIn],
  };
}

const COAL_GEN_WATER_PER_MIN = 45;

function mkCoalGeneratorBurn(
  className: string,
  name: string,
  fuelItem: string,
  fuelPerMinute: number,
): RecipeIndexEntry {
  return mk(
    className,
    name,
    "Desc_GeneratorCoal_C",
    [
      { item: fuelItem, amount: fuelPerMinute },
      { item: "Desc_Water_C", amount: COAL_GEN_WATER_PER_MIN },
    ],
    [],
    RATE_NOMINAL_DURATION_S,
  );
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
  /** 120 m³/min à 100 % : crafts 60/min × 2 unités par craft. */
  mk(
    "Synthetic_WaterExtractor_Water_C",
    "Water Extractor — Water (120 m³/min)",
    "Desc_WaterPump_C",
    [],
    [{ item: "Desc_Water_C", amount: 2 }],
  ),
  /** 120 m³/min pétrole brut @ 100 % — même logique que l’extracteur d’eau. */
  mk(
    "Synthetic_OilExtractor_LiquidOil_C",
    "Oil Extractor — Crude Oil (120 m³/min)",
    "Desc_OilPump_C",
    [],
    [{ item: "Desc_LiquidOil_C", amount: 2 }],
  ),
  mkCoalGeneratorBurn(
    "Synthetic_GeneratorCoal_Consume_C",
    "Coal-Powered Generator — coal (15/min)",
    "Desc_Coal_C",
    15,
  ),
  mkCoalGeneratorBurn(
    "Synthetic_GeneratorCoal_Compacted_C",
    "Coal-Powered Generator — compacted coal (7.143/min)",
    "Desc_CompactedCoal_C",
    7.142857,
  ),
  mkCoalGeneratorBurn(
    "Synthetic_GeneratorCoal_Coke_C",
    "Coal-Powered Generator — petroleum coke (25/min)",
    "Desc_PetroleumCoke_C",
    25,
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
