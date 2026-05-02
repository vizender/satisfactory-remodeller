import { clampClockPercent } from "@/lib/clockSpeed";

/**
 * Exposant consommation / vitesses d’horloge (bâtiments de production), wiki Satisfactory.
 * P = P_nominal × (horloge/100)^1,321928
 */
export const PRODUCTION_BUILDING_POWER_EXPONENT = 1.321928;

export function consumerPowerMwAtClock(
  nominalMw: number,
  clockPercent: number | undefined,
): number {
  const c = clampClockPercent(clockPercent) / 100;
  return nominalMw * Math.pow(c, PRODUCTION_BUILDING_POWER_EXPONENT);
}
