/**
 * Aligné avec `buildMachineGraph.ts` et `ItemPortNode` (carte port avec icône + débits + forçage).
 * `PORT_STACK_STEP` doit être ≥ hauteur réelle d’un port pour éviter le chevauchement vertical.
 */
export const MACHINE_LAYOUT = {
  PORT_W: 96,
  /** Hauteur mini d’une rangée port (contenu + « Forcer »). */
  PORT_ROW: 108,
  /** Distance entre les `y` de deux ports consécutifs sur une même colonne. */
  PORT_STACK_STEP: 112,
  BODY_W: 220,
  GUTTER: 6,
} as const;
