import type { Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  CONTAINER_BUILDING_CLASS,
  CONTAINER_DEFAULT_LABEL,
  CONTAINER_SLOT_COUNT,
} from "@/constants/container";
import { alignFrameHeight, computeVerticalSlotYs } from "@/lib/machinePortLayout";
import {
  CONTAINER_UNASSIGNED_ITEM,
  formatItemClassId,
  type ContainerFrameData,
  type ContainerVariant,
  type ItemPortData,
} from "@/types/graph";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;

export interface ContainerBlueprint {
  id: string;
  position: { x: number; y: number };
  label: string;
  variant: ContainerVariant;
  outputEnabled: boolean;
  /** itemId par index de slot (entrée / sortie partagé). */
  slotItems?: string[];
}

function bodyPanelMinHeight(slotCount: number): number {
  const headerBlock = 52;
  const toggles = 44;
  const sectionHeader = 14;
  const rowH = 22;
  const storageRow = 18;
  const footer = 8;
  return (
    headerBlock +
    toggles +
    sectionHeader +
    slotCount * (rowH + storageRow) +
    footer
  );
}

export function getContainerFrameDimensions(variant: ContainerVariant): {
  frameW: number;
  frameH: number;
  slotCount: number;
} {
  const slotCount = CONTAINER_SLOT_COUNT[variant];
  const frameW = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;
  const maxCol = Math.max(slotCount, 1);
  const bodyMin = bodyPanelMinHeight(slotCount);
  const frameH = alignFrameHeight(bodyMin + 24, maxCol);
  return { frameW, frameH, slotCount };
}

export function defaultContainerFrameData(
  variant: ContainerVariant,
  label?: string,
): ContainerFrameData {
  return {
    label: label ?? CONTAINER_DEFAULT_LABEL[variant],
    variant,
    outputEnabled: true,
    buildingClassId: CONTAINER_BUILDING_CLASS[variant],
  };
}

export function computeContainerFramePosition(
  variant: ContainerVariant,
  anchorInFlow: { x: number; y: number },
): { x: number; y: number } {
  const { frameW, frameH } = getContainerFrameDimensions(variant);
  return {
    x: anchorInFlow.x - frameW / 2,
    y: anchorInFlow.y - frameH / 2,
  };
}

function slotItemLabel(itemId: string): string {
  if (!itemId) return "—";
  return formatItemClassId(itemId);
}

/** Construit le cadre conteneur + ports (1 ou 2 paires entrée / sortie). */
export function buildContainerNodes(bp: ContainerBlueprint): Node[] {
  const { frameW, frameH, slotCount } = getContainerFrameDimensions(bp.variant);
  const frameData: ContainerFrameData = {
    ...defaultContainerFrameData(bp.variant, bp.label),
    outputEnabled: bp.outputEnabled,
  };

  const nodes: Node[] = [
    {
      id: bp.id,
      type: "containerFrame",
      position: bp.position,
      style: { width: frameW, height: frameH },
      connectable: false,
      draggable: true,
      selectable: true,
      deletable: true,
      zIndex: 0,
      data: frameData,
    },
  ];

  const ysIn = computeVerticalSlotYs(slotCount, frameH);
  const ysOut = computeVerticalSlotYs(slotCount, frameH);

  for (let slot = 0; slot < slotCount; slot++) {
    const itemId = bp.slotItems?.[slot] ?? CONTAINER_UNASSIGNED_ITEM;
    const displayName = slotItemLabel(itemId);
    /** Pas de débit recette : le solveur alimente selon le surplus amont. */
    const nominal = 0;

    const inData: ItemPortData = {
      kind: "in",
      portIndex: slot,
      itemId,
      displayName,
      perMinute: nominal,
      amountPerCraft: 1,
      slotsOnSide: slotCount,
    };
    nodes.push({
      id: `${bp.id}-in-${slot}`,
      type: "itemPort",
      parentId: bp.id,
      position: { x: GUTTER, y: ysIn[slot] ?? 0 },
      data: inData,
      draggable: false,
      selectable: true,
      deletable: true,
      zIndex: 1,
    });

    const outData: ItemPortData = {
      kind: "out",
      portIndex: slot,
      itemId,
      displayName,
      perMinute: nominal,
      amountPerCraft: 1,
      slotsOnSide: slotCount,
    };
    nodes.push({
      id: `${bp.id}-out-${slot}`,
      type: "itemPort",
      parentId: bp.id,
      position: { x: frameW - PORT_W - GUTTER, y: ysOut[slot] ?? 0 },
      data: outData,
      draggable: false,
      selectable: true,
      deletable: true,
      zIndex: 1,
    });
  }

  return nodes;
}

export function containerBlueprintFromFrame(
  frame: Node,
  portNodes: Node[],
): ContainerBlueprint {
  const d = frame.data as ContainerFrameData;
  const variant = d.variant ?? "standard";
  const slotCount = CONTAINER_SLOT_COUNT[variant];
  const slotItems: string[] = [];
  for (let slot = 0; slot < slotCount; slot++) {
    const inNode = portNodes.find(
      (n) =>
        n.parentId === frame.id &&
        n.type === "itemPort" &&
        (n.data as ItemPortData).kind === "in" &&
        (n.data as ItemPortData).portIndex === slot,
    );
    const inData = inNode?.data as ItemPortData | undefined;
    slotItems[slot] = inData?.itemId ?? CONTAINER_UNASSIGNED_ITEM;
  }
  return {
    id: frame.id,
    position: { ...frame.position },
    label: d.label,
    variant,
    outputEnabled: d.outputEnabled !== false,
    slotItems,
  };
}
