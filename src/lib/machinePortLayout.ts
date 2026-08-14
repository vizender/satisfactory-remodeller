import { MACHINE_SNAP_GRID } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";

const { PORT_ROW, PORT_STACK_STEP, PORT_COL_TOP, FRAME_V_MARGIN, FRAME_MIN_H } =
  MACHINE_LAYOUT;

/**
 * Smallest frame height ≥ `minH` on the machine grid. Extra height goes
 * below the port column so the first slot stays at `PORT_COL_TOP`.
 */
export function alignFrameHeight(minH: number, portCount: number): number {
  const maxCol = Math.max(portCount, 1);
  const portBottom =
    PORT_COL_TOP + (maxCol - 1) * PORT_STACK_STEP + PORT_ROW;
  const g = MACHINE_SNAP_GRID;
  return (
    Math.ceil(
      Math.max(minH, FRAME_MIN_H, portBottom + FRAME_V_MARGIN) / g,
    ) * g
  );
}

/** Local Y of the handle center for slot `i` (on the 16px grid). */
export function portHandleLocalY(slotIndex: number): number {
  return PORT_COL_TOP + slotIndex * PORT_STACK_STEP + PORT_ROW / 2;
}

/**
 * Top edge of each port card. Same first Y on every machine, regardless of
 * how tall the body is — so 1-port and 2-port tops share a grid row.
 */
export function computeVerticalSlotYs(
  count: number,
  _frameH?: number,
): number[] {
  if (count <= 0) return [];
  return Array.from(
    { length: count },
    (_, i) => PORT_COL_TOP + i * PORT_STACK_STEP,
  );
}

export function nearestSlotIndex(
  relativeY: number,
  slotCount: number,
  frameH: number,
): number {
  if (slotCount <= 1) return 0;
  const ys = computeVerticalSlotYs(slotCount, frameH);
  let best = 0;
  let bestDist = Infinity;
  for (let s = 0; s < slotCount; s++) {
    const cy = (ys[s] ?? 0) + PORT_ROW / 2;
    const dist = Math.abs(relativeY - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}
