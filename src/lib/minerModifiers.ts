import type { MachineFrameData } from "@/types/graph";

export type MinerMk = 1 | 2 | 3;
export type MinerPurity = "impure" | "normal" | "pure";

export function isMinerRecipe(recipe: { producedIn?: string[] } | null | undefined): boolean {
  return recipe?.producedIn?.[0] === "Desc_MinerMk1_C";
}

export function minerMk(data: Pick<MachineFrameData, "minerMk">): MinerMk {
  return data.minerMk === 2 || data.minerMk === 3 ? data.minerMk : 1;
}

export function minerPurity(data: Pick<MachineFrameData, "minerPurity">): MinerPurity {
  return data.minerPurity === "impure" || data.minerPurity === "pure"
    ? data.minerPurity : "normal";
}

export function minerRateMultiplier(data: Pick<MachineFrameData, "minerMk" | "minerPurity">): number {
  const purity = minerPurity(data);
  return 2 ** (minerMk(data) - 1) * (purity === "impure" ? 0.5 : purity === "pure" ? 2 : 1);
}

export function machineClassForFrame(
  recipe: { producedIn?: string[] } | null | undefined,
  data: Pick<MachineFrameData, "minerMk">,
): string | undefined {
  return isMinerRecipe(recipe) ? `Desc_MinerMk${minerMk(data)}_C` : recipe?.producedIn?.[0];
}
