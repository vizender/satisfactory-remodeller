import { MACHINE_LAYOUT } from "./machineLayout";

/** An unconnected factory still has the same core size as a machine. */
export const FACTORY_LAYOUT = {
  WIDTH: MACHINE_LAYOUT.BODY_W,
  HEIGHT: MACHINE_LAYOUT.FRAME_MIN_H,
} as const;
