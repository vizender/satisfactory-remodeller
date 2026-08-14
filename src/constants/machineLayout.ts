/**
 * Aligné avec `buildMachineGraph.ts` et `ItemPortNode` (carte port avec icône + débits + forçage).
 * Widths, heights and `PORT_STACK_STEP` are multiples of `MACHINE_SNAP_GRID` (16)
 * so every port node of a multi-IO machine can sit on the grid at once.
 */
export const MACHINE_LAYOUT = {
  PORT_W: 96,
  /** Hauteur d’une rangée port (contenu + « Forcer »). Multiple of 16. */
  PORT_ROW: 112,
  /** Distance between consecutive port node tops on a column. */
  PORT_STACK_STEP: 112,
  BODY_W: 224,
  GUTTER: 16,
  FRAME_V_MARGIN: 16,
  FRAME_MIN_H: 208,
} as const;
