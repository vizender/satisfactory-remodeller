/** Vitesses d’horloge Satisfactory (% affiché dans le jeu). */

export const CLOCK_MIN = 0;
export const CLOCK_MAX = 250;
export const CLOCK_DEFAULT = 100;

export function clampClockPercent(v: number | undefined): number {
  if (v === undefined || Number.isNaN(v)) return CLOCK_DEFAULT;
  return Math.min(CLOCK_MAX, Math.max(CLOCK_MIN, Math.round(v)));
}

/** Facteur appliqué aux débits nominaux recette (production linéaire avec la vitesses). */
export function clockMultiplier(clockPercent: number | undefined): number {
  return clampClockPercent(clockPercent) / 100;
}
