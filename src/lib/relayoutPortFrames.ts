import type { Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { getContainerFrameDimensions } from "@/lib/buildContainerGraph";
import {
  getMachineFrameDimensions,
  normalizePortSlotPermutation,
} from "@/lib/buildMachineGraph";
import { computeVerticalSlotYs } from "@/lib/machinePortLayout";
import type {
  ContainerFrameData,
  ItemPortData,
  MachineFrameData,
} from "@/types/graph";

const { PORT_W, BODY_W, GUTTER, FRAME_MIN_H } = MACHINE_LAYOUT;

/** Frame width used by machines and containers (`buildMachineGraph` / `buildContainerGraph`). */
export const PORT_FRAME_W = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;

export function inputPortX(): number {
  return GUTTER;
}

export function outputPortX(frameW: number = PORT_FRAME_W): number {
  return frameW - PORT_W - GUTTER;
}

function numericStyleSize(
  style: Node["style"],
  key: "width" | "height",
): number | undefined {
  const v = style?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function frameSize(n: Node): { w: number; h: number } {
  if (n.type === "machineFrame") {
    const d = n.data as MachineFrameData;
    const dims = getMachineFrameDimensions(d.recipeKey);
    return { w: PORT_FRAME_W, h: dims?.frameH ?? FRAME_MIN_H };
  }
  const d = n.data as ContainerFrameData;
  const dims = getContainerFrameDimensions(d.variant ?? "standard");
  return { w: PORT_FRAME_W, h: dims.frameH };
}

function slotOf(port: ItemPortData, frame: Node): number {
  if (frame.type === "containerFrame") return port.portIndex;
  const fd = frame.data as MachineFrameData;
  const perm =
    port.kind === "in"
      ? fd.inputSlotByRecipeIndex
      : fd.outputSlotByRecipeIndex;
  const n = Math.max(port.slotsOnSide, 1);
  return normalizePortSlotPermutation(n, perm)[port.portIndex] ?? port.portIndex;
}

/**
 * Sit port cards flush on the machine body. Multi-port columns stay
 * top-aligned; a lone input or output is centered in the frame.
 */
export function relayoutPortFrames(nodes: Node[]): Node[] {
  const frames = new Map<string, Node>();
  for (const n of nodes) {
    if (n.type === "machineFrame" || n.type === "containerFrame") {
      frames.set(n.id, n);
    }
  }
  if (frames.size === 0) return nodes;

  const sizeById = new Map<string, { w: number; h: number }>();
  for (const [id, frame] of frames) {
    sizeById.set(id, frameSize(frame));
  }

  let changed = false;
  const next = nodes.map((n) => {
    const size = sizeById.get(n.id);
    if (size) {
      const w = numericStyleSize(n.style, "width");
      const h = numericStyleSize(n.style, "height");
      if (w === size.w && h === size.h) return n;
      changed = true;
      return { ...n, style: { ...n.style, width: size.w, height: size.h } };
    }
    if (n.type !== "itemPort" || !n.parentId) return n;
    const frame = frames.get(n.parentId);
    if (!frame) return n;
    const d = n.data as ItemPortData;
    const x = d.kind === "in" ? inputPortX() : outputPortX();
    const frameH = sizeById.get(n.parentId)?.h ?? FRAME_MIN_H;
    const ys = computeVerticalSlotYs(Math.max(d.slotsOnSide, 1), frameH);
    const y = ys[slotOf(d, frame)] ?? ys[0] ?? n.position.y;
    if (n.position.x === x && n.position.y === y) return n;
    changed = true;
    return { ...n, position: { x, y } };
  });
  return changed ? next : nodes;
}
