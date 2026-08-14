/**
 * Port cards sit flush on the machine body (`GUTTER` is 0).
 * Machine cores snap to `MACHINE_SNAP_GRID` on X.
 * Port *handles* sit on that grid vertically: `PORT_COL_TOP + PORT_ROW / 2`
 * is a multiple of 16. Multi-port columns start at `PORT_COL_TOP`; a lone
 * input or output is centered in the machine as close as the grid allows.
 */
export const MACHINE_LAYOUT = {
  PORT_W: 96,
  /** Hauteur d’une rangée port (contenu + « Forcer »). */
  PORT_ROW: 112,
  /** Distance between consecutive port node tops on a column. */
  PORT_STACK_STEP: 112,
  BODY_W: 224,
  /** Horizontal gap between a port card and the machine body. */
  GUTTER: 0,
  /**
   * Top of the first port card. Chosen so the handle center
   * (`PORT_COL_TOP + PORT_ROW / 2` = 64) lands on the 16px grid.
   */
  PORT_COL_TOP: 8,
  FRAME_V_MARGIN: 16,
  FRAME_MIN_H: 208,
} as const;
