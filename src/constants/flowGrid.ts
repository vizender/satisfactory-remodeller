/** Visible background grid spacing in ReactFlow (px). */
export const BACKGROUND_GRID_GAP = 16;

/** Actual snap increment for node/port placement (px). */
export const SNAP_GRID_SIZE = 2;

/** Quantize a scalar to the nearest snap grid step. */
export function snapToGrid(value: number, gridSize = SNAP_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Quantize a point to the nearest snap grid step on both axes. */
export function snapPointToGrid(
  point: { x: number; y: number },
  gridSize = SNAP_GRID_SIZE,
): { x: number; y: number } {
  return {
    x: snapToGrid(point.x, gridSize),
    y: snapToGrid(point.y, gridSize),
  };
}
