import { MACHINE_SNAP_GRID, snapToGrid } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";

const { PORT_ROW, PORT_STACK_STEP, FRAME_V_MARGIN, FRAME_MIN_H } =
  MACHINE_LAYOUT;

/**
 * Smallest frame height ≥ `minH` that is on the machine grid and that
 * vertically centers a port column so every slot Y is also on the grid.
 */
export function alignFrameHeight(minH: number, portCount: number): number {
  const maxCol = Math.max(portCount, 1);
  const portInnerH = (maxCol - 1) * PORT_STACK_STEP + PORT_ROW;
  const g = MACHINE_SNAP_GRID;
  const double = g * 2;
  let h = Math.ceil(Math.max(minH, FRAME_MIN_H, portInnerH + 2 * FRAME_V_MARGIN) / g) * g;
  while ((h - portInnerH) % double !== 0) h += g;
  return h;
}

/**
 * Positions `y` du bord supérieur de chaque créneau port (colonne entrée ou sortie).
 * Spacing is `PORT_STACK_STEP` on every machine; Ys land on the machine grid
 * when `frameH` comes from `alignFrameHeight`.
 */
export function computeVerticalSlotYs(
  count: number,
  frameH: number,
): number[] {
  if (count <= 0) return [];
  const span = count <= 1 ? 0 : (count - 1) * PORT_STACK_STEP;
  const top = snapToGrid((frameH - span - PORT_ROW) / 2, MACHINE_SNAP_GRID);
  return Array.from({ length: count }, (_, i) => top + i * PORT_STACK_STEP);
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
