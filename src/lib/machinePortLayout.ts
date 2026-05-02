import { MACHINE_LAYOUT } from "@/constants/machineLayout";

const { PORT_ROW, PORT_STACK_STEP } = MACHINE_LAYOUT;

/**
 * Positions `y` du bord supérieur de chaque créneau port (colonne entrée ou sortie).
 */
export function computeVerticalSlotYs(
  count: number,
  frameH: number,
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(frameH - PORT_ROW) / 2];
  const span = (count - 1) * PORT_STACK_STEP;
  const top = (frameH - span - PORT_ROW) / 2;
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
