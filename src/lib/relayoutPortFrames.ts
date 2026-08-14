import type { Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import type { ItemPortData } from "@/types/graph";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;

/** Frame width used by machines and containers (`buildMachineGraph` / `buildContainerGraph`). */
export const PORT_FRAME_W = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;

export function inputPortX(): number {
  return GUTTER;
}

export function outputPortX(frameW: number = PORT_FRAME_W): number {
  return frameW - PORT_W - GUTTER;
}

function numericStyleWidth(style: Node["style"]): number | undefined {
  const w = style?.width;
  if (typeof w === "number" && Number.isFinite(w)) return w;
  if (typeof w === "string") {
    const n = parseFloat(w);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Snap port cards flush to the machine/container body.
 *
 * The body is painted from `PORT_W + GUTTER` with width `BODY_W`. Saved
 * documents from before 1.4.3 still have GUTTER=6 / BODY_W=220 coordinates,
 * so inputs float off the core and outputs overlap it.
 */
export function relayoutPortFrames(nodes: Node[]): Node[] {
  const frameIds = new Set<string>();
  for (const n of nodes) {
    if (n.type === "machineFrame" || n.type === "containerFrame") {
      frameIds.add(n.id);
    }
  }
  if (frameIds.size === 0) return nodes;

  let changed = false;
  const next = nodes.map((n) => {
    if (frameIds.has(n.id)) {
      if (numericStyleWidth(n.style) === PORT_FRAME_W) return n;
      changed = true;
      return { ...n, style: { ...n.style, width: PORT_FRAME_W } };
    }
    if (n.type !== "itemPort" || !n.parentId || !frameIds.has(n.parentId)) {
      return n;
    }
    const d = n.data as ItemPortData;
    const x = d.kind === "in" ? inputPortX() : outputPortX();
    if (n.position.x === x) return n;
    changed = true;
    return { ...n, position: { ...n.position, x } };
  });
  return changed ? next : nodes;
}
