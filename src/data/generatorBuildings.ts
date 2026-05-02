import type { GeneratorBuildingSpec } from "@/types/power";

/**
 * Générateurs : puissance fixe par bâtiment, débits nominaux (/min) par mode.
 * Fluides des générateurs **liquides** en m³/min (wiki). Géothermie / Alien Power Augmentor : hors périmètre.
 *
 * Brûleur biomasse : **solides uniquement** — feuilles, mycélium, bois, biofuel solide (`Desc_Biofuel_C`),
 * restes aliens (7,2/min / type). La ligne wiki « 2,4 biofuel/min » n’est pas dupliquée ici
 * (conflit sémantique avec le solid à 4/min ; liquide exclu du brûleur).
 */
export const GENERATOR_BUILDING_SPECS: GeneratorBuildingSpec[] = [
  {
    classId: "Desc_GeneratorBiomass_Automated_C",
    powerMw: 30,
    modes: [
      { key: "leaves", inputs: [{ itemId: "Desc_Leaves_C", perMinute: 120 }], outputs: [] },
      { key: "mycelia", inputs: [{ itemId: "Desc_Mycelia_C", perMinute: 90 }], outputs: [] },
      { key: "wood", inputs: [{ itemId: "Desc_Wood_C", perMinute: 18 }], outputs: [] },
      {
        key: "solid-biofuel",
        inputs: [{ itemId: "Desc_Biofuel_C", perMinute: 4 }],
        outputs: [],
      },
      { key: "hog-remains", inputs: [{ itemId: "Desc_HogParts_C", perMinute: 7.2 }], outputs: [] },
      {
        key: "spitter-remains",
        inputs: [{ itemId: "Desc_SpitterParts_C", perMinute: 7.2 }],
        outputs: [],
      },
      {
        key: "stinger-remains",
        inputs: [{ itemId: "Desc_StingerParts_C", perMinute: 7.2 }],
        outputs: [],
      },
      {
        key: "hatcher-remains",
        inputs: [{ itemId: "Desc_HatcherParts_C", perMinute: 7.2 }],
        outputs: [],
      },
    ],
  },
  {
    classId: "Desc_GeneratorCoal_C",
    powerMw: 75,
    modes: [
      { key: "coal", inputs: [{ itemId: "Desc_Coal_C", perMinute: 15 }], outputs: [] },
      {
        key: "compacted-coal",
        inputs: [{ itemId: "Desc_CompactedCoal_C", perMinute: 7.142857 }],
        outputs: [],
      },
      {
        key: "petroleum-coke",
        inputs: [{ itemId: "Desc_PetroleumCoke_C", perMinute: 25 }],
        outputs: [],
      },
    ],
  },
  {
    classId: "Desc_GeneratorFuel_C",
    powerMw: 250,
    modes: [
      { key: "fuel", inputs: [{ itemId: "Desc_LiquidFuel_C", perMinute: 20 }], outputs: [] },
      {
        key: "liquid-biofuel",
        inputs: [{ itemId: "Desc_LiquidBiofuel_C", perMinute: 20 }],
        outputs: [],
      },
      {
        key: "turbofuel",
        inputs: [{ itemId: "Desc_LiquidTurboFuel_C", perMinute: 7.5 }],
        outputs: [],
      },
      {
        key: "rocket-fuel",
        inputs: [{ itemId: "Desc_RocketFuel_C", perMinute: 4.166666666666667 }],
        outputs: [],
      },
      {
        key: "ionized-fuel",
        inputs: [{ itemId: "Desc_IonizedFuel_C", perMinute: 3 }],
        outputs: [],
      },
    ],
  },
  {
    classId: "Desc_GeneratorNuclear_C",
    powerMw: 2500,
    modes: [
      {
        key: "uranium-fuel-rod-burning",
        inputs: [
          { itemId: "Desc_NuclearFuelRod_C", perMinute: 0.2 },
          { itemId: "Desc_Water_C", perMinute: 240 },
        ],
        outputs: [{ itemId: "Desc_NuclearWaste_C", perMinute: 10 }],
      },
      {
        key: "plutonium-fuel-rod-burning",
        inputs: [
          { itemId: "Desc_PlutoniumFuelRod_C", perMinute: 0.1 },
          { itemId: "Desc_Water_C", perMinute: 240 },
        ],
        outputs: [{ itemId: "Desc_PlutoniumWaste_C", perMinute: 1 }],
      },
      {
        key: "ficsonium-fuel-rod",
        inputs: [{ itemId: "Desc_FicsoniumFuelRod_C", perMinute: 1 }],
        outputs: [],
      },
    ],
  },
];
