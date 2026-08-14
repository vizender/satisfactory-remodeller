import type { Edge, Node } from "@xyflow/react";
import { buildMachineNodes } from "@/lib/buildMachineGraph";
import { RECIPE_IRON_INGOT, RECIPE_IRON_PLATE } from "@/tutorial/constants";

export type LabSceneId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const LAB_SCENE_META: { id: LabSceneId; name: string; group: string }[] = [
  { id: 1, name: "1-to-1 forward aligned", group: "Simple" },
  { id: 2, name: "1-to-1 forward offset", group: "Simple" },
  { id: 3, name: "1-to-1 reverse offset (wrap)", group: "Simple" },
  { id: 4, name: "1-to-1 reverse aligned (U)", group: "Simple" },
  { id: 5, name: "1-to-2", group: "Networks" },
  { id: 6, name: "1-to-3", group: "Networks" },
  { id: 7, name: "2-to-1", group: "Networks" },
  { id: 8, name: "2-to-2 bus", group: "Networks" },
  { id: 9, name: "Two nets cross", group: "Stress" },
  { id: 10, name: "Mixed board", group: "Stress" },
  { id: 11, name: "Empty playground", group: "Stress" },
];

function smelter(id: string, x: number, y: number, label: string): Node[] {
  return buildMachineNodes({
    id,
    position: { x, y },
    label,
    recipeKey: RECIPE_IRON_INGOT,
  });
}

function constructor(id: string, x: number, y: number, label: string): Node[] {
  return buildMachineNodes({
    id,
    position: { x, y },
    label,
    recipeKey: RECIPE_IRON_PLATE,
  });
}

function link(source: string, target: string, itemId: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: "item",
    targetHandle: "item",
    data: { itemId },
  };
}

const INGOT = "Desc_IronIngot_C";

export function buildLabScene(id: LabSceneId): { nodes: Node[]; edges: Edge[] } {
  switch (id) {
    case 1:
      return {
        nodes: [
          ...smelter("mS", 80, 140, "Smelter"),
          ...constructor("mT", 720, 140, "Constructor"),
        ],
        edges: [link("mS-out-0", "mT-in-0", INGOT)],
      };
    case 2:
      return {
        nodes: [
          ...smelter("mS", 80, 40, "Smelter"),
          ...constructor("mT", 720, 300, "Constructor"),
        ],
        edges: [link("mS-out-0", "mT-in-0", INGOT)],
      };
    case 3:
      return {
        nodes: [
          ...smelter("mS", 720, 80, "Smelter"),
          ...constructor("mT", 80, 340, "Constructor"),
        ],
        edges: [link("mS-out-0", "mT-in-0", INGOT)],
      };
    case 4:
      return {
        nodes: [
          ...smelter("mS", 720, 200, "Smelter"),
          ...constructor("mT", 80, 200, "Constructor"),
        ],
        edges: [link("mS-out-0", "mT-in-0", INGOT)],
      };
    case 5:
      return {
        nodes: [
          ...smelter("mS", 60, 180, "Smelter"),
          ...constructor("mT1", 740, 40, "Ctor A"),
          ...constructor("mT2", 740, 340, "Ctor B"),
        ],
        edges: [
          link("mS-out-0", "mT1-in-0", INGOT),
          link("mS-out-0", "mT2-in-0", INGOT),
        ],
      };
    case 6:
      return {
        nodes: [
          ...smelter("mS", 40, 200, "Smelter"),
          ...constructor("mT1", 760, 20, "Ctor A"),
          ...constructor("mT2", 760, 220, "Ctor B"),
          ...constructor("mT3", 760, 420, "Ctor C"),
        ],
        edges: [
          link("mS-out-0", "mT1-in-0", INGOT),
          link("mS-out-0", "mT2-in-0", INGOT),
          link("mS-out-0", "mT3-in-0", INGOT),
        ],
      };
    case 7:
      return {
        nodes: [
          ...smelter("mS1", 40, 40, "Smelter A"),
          ...smelter("mS2", 40, 340, "Smelter B"),
          ...constructor("mT", 760, 180, "Constructor"),
        ],
        edges: [
          link("mS1-out-0", "mT-in-0", INGOT),
          link("mS2-out-0", "mT-in-0", INGOT),
        ],
      };
    case 8:
      return {
        nodes: [
          ...smelter("mS1", 40, 40, "Smelter A"),
          ...smelter("mS2", 40, 360, "Smelter B"),
          ...constructor("mT1", 760, 80, "Ctor A"),
          ...constructor("mT2", 760, 400, "Ctor B"),
        ],
        edges: [
          link("mS1-out-0", "mT1-in-0", INGOT),
          link("mS1-out-0", "mT2-in-0", INGOT),
          link("mS2-out-0", "mT1-in-0", INGOT),
          link("mS2-out-0", "mT2-in-0", INGOT),
        ],
      };
    case 9:
      return {
        nodes: [
          ...smelter("mA", 40, 160, "Net A src"),
          ...constructor("mAt", 780, 160, "Net A dst"),
          ...smelter("mB", 80, 20, "Net B src"),
          ...constructor("mBt", 520, 380, "Net B dst"),
        ],
        edges: [
          link("mA-out-0", "mAt-in-0", INGOT),
          link("mB-out-0", "mBt-in-0", INGOT),
        ],
      };
    case 10:
      return {
        nodes: [
          ...smelter("mR", 760, 20, "Reverse src"),
          ...constructor("mRt", 40, 20, "Reverse dst"),
          ...smelter("mS", 40, 260, "Fan src"),
          ...constructor("mT1", 780, 200, "Fan A"),
          ...constructor("mT2", 780, 440, "Fan B"),
          ...smelter("mC", 200, 120, "Cross src"),
          ...constructor("mCt", 560, 480, "Cross dst"),
        ],
        edges: [
          link("mR-out-0", "mRt-in-0", INGOT),
          link("mS-out-0", "mT1-in-0", INGOT),
          link("mS-out-0", "mT2-in-0", INGOT),
          link("mC-out-0", "mCt-in-0", INGOT),
        ],
      };
    case 11:
      return {
        nodes: [
          ...smelter("mS", 120, 160, "Smelter"),
          ...constructor("mT", 680, 160, "Constructor"),
        ],
        edges: [],
      };
  }
}
