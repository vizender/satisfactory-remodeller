import type { Edge, Node } from "@xyflow/react";
import { snapToGrid } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";

const { PORT_ROW } = MACHINE_LAYOUT;

/** Max vertical distance (px) to engage horizontal port alignment while dragging. */
export const RIGID_SNAP_THRESHOLD = 28;

/** Larger threshold on drag release to absorb trackpad / mouse jitter. */
export const RIGID_SNAP_RELEASE_THRESHOLD = 40;

/** While already snapped, keep alignment until movement exceeds this distance. */
export const RIGID_SNAP_HOLD_THRESHOLD = 48;

const RIGID_SNAP_FRAME_TYPES = new Set(["machineFrame", "containerFrame"]);

export type RigidSnapOptions = {
  threshold?: number;
  /** Stored frame position before this change — enables hold hysteresis. */
  currentPos?: { x: number; y: number };
  /** Use the wider release threshold (drag end). */
  onRelease?: boolean;
};

export function portHandleAbsY(
  framePos: { x: number; y: number },
  portRelY: number,
): number {
  return framePos.y + portRelY + PORT_ROW / 2;
}

export function findPortPartnerIds(portId: string, edges: Edge[]): string[] {
  const partners: string[] = [];
  for (const e of edges) {
    if (e.source === portId) partners.push(e.target);
    else if (e.target === portId) partners.push(e.source);
  }
  return partners;
}

export function partnerHandleAbsY(
  partnerPortId: string,
  nodes: Node[],
): number | null {
  const partner = nodes.find(
    (n) => n.id === partnerPortId && n.type === "itemPort",
  );
  if (!partner?.parentId) return null;
  const frame = nodes.find((n) => n.id === partner.parentId);
  if (!frame) return null;
  return portHandleAbsY(frame.position, partner.position.y);
}

function frameYForPartnerAlign(
  portRelY: number,
  partnerAbsY: number,
): number {
  return snapToGrid(partnerAbsY - portRelY - PORT_ROW / 2);
}

function findAlignedFrameY(
  frameId: string,
  framePos: { x: number; y: number },
  nodes: Node[],
  edges: Edge[],
  threshold: number,
): number | null {
  const ports = nodes.filter(
    (n) => n.parentId === frameId && n.type === "itemPort",
  );
  let snapY: number | null = null;
  let bestDist = threshold;

  for (const port of ports) {
    for (const partnerId of findPortPartnerIds(port.id, edges)) {
      const partnerAbsY = partnerHandleAbsY(partnerId, nodes);
      if (partnerAbsY === null) continue;
      const ourAbsY = portHandleAbsY(framePos, port.position.y);
      const dist = Math.abs(ourAbsY - partnerAbsY);
      if (dist < bestDist) {
        bestDist = dist;
        snapY = frameYForPartnerAlign(port.position.y, partnerAbsY);
      }
    }
  }

  return snapY;
}

function isHorizontallyAligned(
  framePos: { x: number; y: number },
  portRelY: number,
  partnerAbsY: number,
): boolean {
  return Math.abs(portHandleAbsY(framePos, portRelY) - partnerAbsY) <= 2;
}

/**
 * Adjust frame Y so connected ports align horizontally with partners within
 * threshold. Applies hold hysteresis when `currentPos` is already aligned.
 */
export function rigidSnapFramePosition(
  frameId: string,
  proposedPos: { x: number; y: number },
  nodes: Node[],
  edges: Edge[],
  options?: RigidSnapOptions,
): { x: number; y: number } {
  const threshold =
    options?.threshold ??
    (options?.onRelease ? RIGID_SNAP_RELEASE_THRESHOLD : RIGID_SNAP_THRESHOLD);

  if (options?.currentPos) {
    const ports = nodes.filter(
      (n) => n.parentId === frameId && n.type === "itemPort",
    );
    for (const port of ports) {
      for (const partnerId of findPortPartnerIds(port.id, edges)) {
        const partnerAbsY = partnerHandleAbsY(partnerId, nodes);
        if (partnerAbsY === null) continue;
        if (
          !isHorizontallyAligned(
            options.currentPos,
            port.position.y,
            partnerAbsY,
          )
        ) {
          continue;
        }
        const proposedAbsY = portHandleAbsY(proposedPos, port.position.y);
        if (
          Math.abs(proposedAbsY - partnerAbsY) < RIGID_SNAP_HOLD_THRESHOLD
        ) {
          return {
            x: proposedPos.x,
            y: frameYForPartnerAlign(port.position.y, partnerAbsY),
          };
        }
      }
    }
  }

  const snapY = findAlignedFrameY(
    frameId,
    proposedPos,
    nodes,
    edges,
    threshold,
  );
  if (snapY !== null) {
    return { x: proposedPos.x, y: snapY };
  }
  return proposedPos;
}

/** Nudge frame Y so `portRelY` on `frameId` aligns with a connected partner. */
export function frameYForPortHorizontalAlign(
  frameId: string,
  portId: string,
  portRelY: number,
  nodes: Node[],
  edges: Edge[],
  threshold = RIGID_SNAP_THRESHOLD,
): number | null {
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame) return null;

  let bestY: number | null = null;
  let bestDist = threshold;

  for (const partnerId of findPortPartnerIds(portId, edges)) {
    const partnerAbsY = partnerHandleAbsY(partnerId, nodes);
    if (partnerAbsY === null) continue;
    const ourAbsY = portHandleAbsY(frame.position, portRelY);
    const dist = Math.abs(ourAbsY - partnerAbsY);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = frameYForPartnerAlign(portRelY, partnerAbsY);
    }
  }

  return bestY;
}

export function isRigidSnapFrameType(type: string | undefined): boolean {
  return RIGID_SNAP_FRAME_TYPES.has(type ?? "");
}

/** Align a newly built frame so `connectedPortId` is horizontal with `linkOriginPortId`. */
export function snapBuiltFrameToLinkOrigin(
  built: Node[],
  frameId: string,
  linkOriginPortId: string,
  connectedPortId: string,
  existingNodes: Node[],
  threshold = RIGID_SNAP_THRESHOLD,
): void {
  const frame = built.find((n) => n.id === frameId);
  const port = built.find((n) => n.id === connectedPortId);
  if (!frame || !port || port.type !== "itemPort") return;

  const originAbsY = partnerHandleAbsY(linkOriginPortId, existingNodes);
  if (originAbsY === null) return;

  const proposedAbsY = portHandleAbsY(frame.position, port.position.y);
  if (Math.abs(proposedAbsY - originAbsY) >= threshold) return;

  frame.position = {
    ...frame.position,
    y: frameYForPartnerAlign(port.position.y, originAbsY),
  };
}
