import type { Node } from "@xyflow/react";
import { FACTORY_LAYOUT } from "@/constants/factoryLayout";
import type { FactoryFrameData } from "@/types/graph";

const { WIDTH, HEIGHT } = FACTORY_LAYOUT;

export function defaultFactoryBoundary(): FactoryFrameData["boundary"] {
  return { version: 1, inputs: [], outputs: [] };
}

export function defaultFactoryFrameData(label: string): FactoryFrameData {
  return {
    label,
    boundary: defaultFactoryBoundary(),
    appearance: { version: 1 },
  };
}

export function buildFactoryNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  data?: Partial<FactoryFrameData>,
): Node {
  return {
    id,
    type: "factoryFrame",
    position,
    style: { width: WIDTH, height: HEIGHT },
    connectable: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 0,
    data: {
      ...defaultFactoryFrameData(label),
      ...data,
      label,
    } satisfies FactoryFrameData,
  };
}
