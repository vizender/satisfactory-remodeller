/** Visible background grid spacing in ReactFlow (px). */
export const BACKGROUND_GRID_GAP = 16;

/**
 * Fine quantization for belt geometry (collapse, merge, kinks). Belts snap to
 * each other, not to the machine grid.
 */
export const SNAP_GRID_SIZE = 2;

/** Machine / port node snap increment (matches the visible grid). */
export const MACHINE_SNAP_GRID = BACKGROUND_GRID_GAP;

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

export function ceilToGrid(value: number, gridSize = MACHINE_SNAP_GRID): number {
  return Math.ceil(value / gridSize) * gridSize;
}

/** Grid used when placing or dragging machines. Fine grid when snap is off. */
export function machinePlacementGridSize(enabled: boolean): number {
  return enabled ? MACHINE_SNAP_GRID : SNAP_GRID_SIZE;
}
