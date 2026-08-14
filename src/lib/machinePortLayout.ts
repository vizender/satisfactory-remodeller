import { MACHINE_SNAP_GRID } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";

const { PORT_ROW, PORT_STACK_STEP, PORT_COL_TOP, FRAME_V_MARGIN, FRAME_MIN_H } =
  MACHINE_LAYOUT;

/**
 * Smallest frame height ≥ `minH` on the machine grid. Extra height goes
 * below a multi-port column so the first slot stays at `PORT_COL_TOP`.
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

/**
 * Card-top Y for a lone port, as close as possible to the frame center,
 * snapped so the handle (`y + PORT_ROW / 2`) stays on the 16px grid.
 */
export function centeredSingleSlotY(frameH: number): number {
  const g = MACHINE_SNAP_GRID;
  const ideal = (frameH - PORT_ROW) / 2;
  let y = Math.round((ideal - PORT_COL_TOP) / g) * g + PORT_COL_TOP;
  const maxY = Math.max(
    PORT_COL_TOP,
    Math.round((frameH - PORT_ROW - FRAME_V_MARGIN - PORT_COL_TOP) / g) * g +
      PORT_COL_TOP,
  );
  if (y < PORT_COL_TOP) y = PORT_COL_TOP;
  if (y > maxY) y = maxY;
  return y;
}

/** Local Y of a stacked-column handle center (on the 16px grid). */
export function portHandleLocalY(slotIndex: number): number {
  return PORT_COL_TOP + slotIndex * PORT_STACK_STEP + PORT_ROW / 2;
}

/**
 * Top edge of each port card.
 * One slot: centered in `frameH`. Two or more: stacked from `PORT_COL_TOP`.
 */
export function computeVerticalSlotYs(
  count: number,
  frameH: number = FRAME_MIN_H,
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [centeredSingleSlotY(frameH)];
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
