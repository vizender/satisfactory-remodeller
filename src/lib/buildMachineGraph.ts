import type { Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { computeVerticalSlotYs } from "@/lib/machinePortLayout";
import { findRecipeByKey } from "@/lib/recipeLookup";
import { clampClockPercent } from "@/lib/clockSpeed";
import type { ItemPortData, MachineFrameData } from "@/types/graph";
import { itemRatesForRecipe } from "@/types/graph";

const { PORT_W, PORT_ROW, PORT_STACK_STEP, BODY_W, GUTTER } = MACHINE_LAYOUT;

/** Marge verticale min sous / au-dessus des colonnes de ports (centrage). */
const FRAME_V_MARGIN = 20;

export function normalizePortSlotPermutation(
  n: number,
  perm: number[] | undefined,
): number[] {
  if (n <= 0) return [];
  if (!perm || perm.length !== n) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const set = new Set(perm);
  if (set.size !== n) return Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    if (!set.has(i)) return Array.from({ length: n }, (_, i) => i);
  }
  return [...perm];
}

export function machineBlueprintFromFrame(frame: Node): MachineBlueprint {
  const d = frame.data as MachineFrameData;
  return {
    id: frame.id,
    position: { ...frame.position },
    label: d.label,
    recipeKey: d.recipeKey,
    clockPercent: d.clockPercent,
    inputSlotByRecipeIndex: d.inputSlotByRecipeIndex,
    outputSlotByRecipeIndex: d.outputSlotByRecipeIndex,
  };
}

/** Hauteur min du panneau central (titre + récap entrées/sorties + pied stats). */
function bodyPanelMinHeight(inputCount: number, outputCount: number): number {
  const headerBlock = 48;
  const sectionHeader = 14;
  const rowH = 24;
  /** Pied : nombre machines, horloge, sloop, puissance, crafts… */
  const footer = 76;
  const gapBetweenSections = 8;
  return (
    headerBlock +
    sectionHeader +
    inputCount * rowH +
    gapBetweenSections +
    sectionHeader +
    outputCount * rowH +
    footer
  );
}

export interface MachineBlueprint {
  id: string;
  position: { x: number; y: number };
  label: string;
  recipeKey: string;
  clockPercent?: number;
  inputSlotByRecipeIndex?: number[];
  outputSlotByRecipeIndex?: number[];
}

/** Construit le cadre machine + un nœud port par entrée/sortie de recette. */
export function buildMachineNodes(bp: MachineBlueprint): Node[] {
  const recipe = findRecipeByKey(bp.recipeKey);
  if (!recipe) {
    const pid = bp.id;
    return [
      {
        id: pid,
        type: "machineFrame",
        position: bp.position,
        style: { width: BODY_W + 2 * (PORT_W + GUTTER), height: 196 },
        connectable: false,
        draggable: true,
        /** Si le parent est sélectionné, XY Flow n’inclut pas les ports dans le drag (`getDragItems`). */
        selectable: false,
        data: {
          label: bp.label,
          recipeKey: bp.recipeKey,
          clockPercent: clampClockPercent(bp.clockPercent),
          missingRecipe: true,
        } satisfies MachineFrameData & { missingRecipe?: boolean },
      },
    ];
  }

  const rates = itemRatesForRecipe(recipe);
  const inN = rates.inputs.length;
  const outN = rates.outputs.length;
  const frameW = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;
  const maxCol = Math.max(inN, outN, 1);
  const portColumnMinH =
    (maxCol - 1) * PORT_STACK_STEP + PORT_ROW + 2 * FRAME_V_MARGIN;
  const bodyMin = bodyPanelMinHeight(inN, outN);
  const frameH = Math.max(196, portColumnMinH, bodyMin + 24);

  const inPerm = normalizePortSlotPermutation(inN, bp.inputSlotByRecipeIndex);
  const outPerm = normalizePortSlotPermutation(outN, bp.outputSlotByRecipeIndex);

  const frameData: MachineFrameData = {
    label: bp.label,
    recipeKey: bp.recipeKey,
    clockPercent: clampClockPercent(bp.clockPercent),
  };
  if (inN > 1) frameData.inputSlotByRecipeIndex = inPerm;
  if (outN > 1) frameData.outputSlotByRecipeIndex = outPerm;

  const pid = bp.id;
  const nodes: Node[] = [
    {
      id: pid,
      type: "machineFrame",
      position: bp.position,
      style: { width: frameW, height: frameH },
      connectable: false,
      draggable: true,
      selectable: false,
      zIndex: 0,
      data: frameData,
    },
  ];

  const ysIn = computeVerticalSlotYs(inN, frameH);
  rates.inputs.forEach((row, recipeIdx) => {
    const slot = inPerm[recipeIdx] ?? recipeIdx;
    const y = ysIn[slot] ?? 0;
    const d: ItemPortData = {
      kind: "in",
      portIndex: recipeIdx,
      itemId: row.itemId,
      displayName: row.displayName,
      perMinute: row.perMinute,
      amountPerCraft: row.amountPerCraft,
      slotsOnSide: inN,
    };
    nodes.push({
      id: `${pid}-in-${recipeIdx}`,
      type: "itemPort",
      parentId: pid,
      position: { x: GUTTER, y },
      data: d,
      draggable: false,
      selectable: true,
      zIndex: 1,
    });
  });

  const ysOut = computeVerticalSlotYs(outN, frameH);
  rates.outputs.forEach((row, recipeIdx) => {
    const slot = outPerm[recipeIdx] ?? recipeIdx;
    const y = ysOut[slot] ?? 0;
    const d: ItemPortData = {
      kind: "out",
      portIndex: recipeIdx,
      itemId: row.itemId,
      displayName: row.displayName,
      perMinute: row.perMinute,
      amountPerCraft: row.amountPerCraft,
      slotsOnSide: outN,
    };
    nodes.push({
      id: `${pid}-out-${recipeIdx}`,
      type: "itemPort",
      parentId: pid,
      position: { x: frameW - PORT_W - GUTTER, y },
      data: d,
      draggable: false,
      selectable: true,
      zIndex: 1,
    });
  });

  return nodes;
}

/** Liste de blueprints → liste plate de nœuds. */
export function buildGraphFromBlueprints(
  blueprints: MachineBlueprint[],
): Node[] {
  return blueprints.flatMap((b) => buildMachineNodes(b));
}
