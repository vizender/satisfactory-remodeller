import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { formatItemClassId } from "@/types/graph";
import { listAllItemIconCandidateFilenames } from "./itemIconCandidates";

const packagedItems = [
  ["Desc_Fuel_C", "Packaged Fuel", "Packaged_Fuel.png"],
  ["Desc_TurboFuel_C", "Packaged Turbofuel", "Packaged_Turbofuel.png"],
  ["Desc_PackagedAlumina_C", "Packaged Alumina Solution", "Packaged_Alumina_Solution.png"],
  ["Desc_PackagedBiofuel_C", "Packaged Liquid Biofuel", "Packaged_Liquid_Biofuel.png"],
  ["Desc_PackagedIonizedFuel_C", "Packaged Ionized Fuel", "Packaged_Ionized_Fuel.png"],
  ["Desc_PackagedNitricAcid_C", "Packaged Nitric Acid", "Packaged_Nitric_Acid.png"],
  ["Desc_PackagedNitrogenGas_C", "Packaged Nitrogen Gas", "Packaged_Nitrogen_Gas.png"],
  ["Desc_PackagedOilResidue_C", "Packaged Heavy Oil Residue", "Packaged_Heavy_Oil_Residue.png"],
  ["Desc_PackagedOil_C", "Packaged Oil", "Packaged_Oil.png"],
  ["Desc_PackagedRocketFuel_C", "Packaged Rocket Fuel", "Packaged_Rocket_Fuel.png"],
  ["Desc_PackagedSulfuricAcid_C", "Packaged Sulfuric Acid", "Packaged_Sulfuric_Acid.png"],
  ["Desc_PackagedWater_C", "Packaged Water", "Packaged_Water.png"],
] as const;

it.each(packagedItems)("shows %s with its packaged label and icon", (itemId, label, icon) => {
  expect(formatItemClassId(itemId)).toBe(label);
  expect(listAllItemIconCandidateFilenames(itemId)[0]).toBe(icon);
  expect(existsSync(fileURLToPath(new URL(`../../Assets/icons/items/${icon}`, import.meta.url)))).toBe(true);
});

it("keeps the existing fuel canister icons as fallback and fluid names distinct", () => {
  expect(listAllItemIconCandidateFilenames("Desc_Fuel_C")[1]).toBe("Fuel.png");
  expect(listAllItemIconCandidateFilenames("Desc_TurboFuel_C")[1]).toBe("Turbofuel.png");
  expect(formatItemClassId("Desc_LiquidFuel_C")).toBe("Liquid Fuel");
  expect(formatItemClassId("Desc_LiquidTurboFuel_C")).toBe("Liquid Turbo Fuel");
});
