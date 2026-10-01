export type Box = { left: number; top: number; right: number; bottom: number };

export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

export function coreIsInBox(selection: Box, core: Box, mode: "full" | "partial"): boolean {
  if (mode === "full") {
    return selection.left <= core.left && selection.top <= core.top &&
      selection.right >= core.right && selection.bottom >= core.bottom;
  }
  return selection.left < core.right && selection.right > core.left &&
    selection.top < core.bottom && selection.bottom > core.top;
}
