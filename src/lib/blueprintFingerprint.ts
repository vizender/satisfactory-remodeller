import type { CanvasRecord } from "@/types/canvas";
export function blueprintFingerprint(canvas: CanvasRecord): string {
  return JSON.stringify({
    name: canvas.name,
    nodes: canvas.nodes.map(
      ({ selected, dragging, measured, resizing, width, height, ...n }) => n,
    ),
    edges: canvas.edges.map(({ selected, ...e }) => e),
    forcedPortRates: canvas.forcedPortRates,
  });
}
