/** Shared geometry; all handle centers stay on the 16px routing grid. */
export const MACHINE_LAYOUT = {
  PORT_W: 128,
  PORT_ROW: 64,
  PORT_STACK_STEP: 64,
  BODY_W: 288,
  GUTTER: 0,
  PORT_COL_TOP: 16,
  FRAME_V_MARGIN: 16,
  FRAME_MIN_H: 320,
} as const;
