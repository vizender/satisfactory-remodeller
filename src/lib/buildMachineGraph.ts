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

export type MachinePlacementAnchor =
  | { mode: "frameCenter" }
  | { mode: "portCenter"; kind: "in" | "out"; itemId: string };

export interface MachineFrameDimensions {
  frameW: number;
  frameH: number;
  inCount: number;
  outCount: number;
}

/** Dimensions du cadre pour une recette (même logique que `buildMachineNodes`). */
export function getMachineFrameDimensions(
  recipeKey: string,
): MachineFrameDimensions | null {
  const recipe = findRecipeByKey(recipeKey);
  if (!recipe) return null;
  const rates = itemRatesForRecipe(recipe);
  const inN = rates.inputs.length;
  const outN = rates.outputs.length;
  const frameW = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;
  const maxCol = Math.max(inN, outN, 1);
  const portColumnMinH =
    (maxCol - 1) * PORT_STACK_STEP + PORT_ROW + 2 * FRAME_V_MARGIN;
  const bodyMin = bodyPanelMinHeight(inN, outN);
  const frameH = Math.max(196, portColumnMinH, bodyMin + 24);
  return { frameW, frameH, inCount: inN, outCount: outN };
}

function portLocalCenter(
  kind: "in" | "out",
  recipeIndex: number,
  inPerm: number[],
  outPerm: number[],
  dims: MachineFrameDimensions,
): { x: number; y: number } {
  const { frameW, frameH, inCount, outCount } = dims;
  if (kind === "in") {
    const ys = computeVerticalSlotYs(inCount, frameH);
    const slot = inPerm[recipeIndex] ?? recipeIndex;
    const y = ys[slot] ?? 0;
    return { x: GUTTER + PORT_W / 2, y: y + PORT_ROW / 2 };
  }
  const ys = computeVerticalSlotYs(outCount, frameH);
  const slot = outPerm[recipeIndex] ?? recipeIndex;
  const y = ys[slot] ?? 0;
  return { x: frameW - GUTTER - PORT_W / 2, y: y + PORT_ROW / 2 };
}

/**
 * Position du cadre machine pour que `anchor` coïncide avec `anchorInFlow` (coords flux).
 */
export function computeMachineFramePosition(
  recipeKey: string,
  anchorInFlow: { x: number; y: number },
  anchor: MachinePlacementAnchor,
  slotPerm?: Pick<
    MachineBlueprint,
    "inputSlotByRecipeIndex" | "outputSlotByRecipeIndex"
  >,
): { x: number; y: number } {
  const dims = getMachineFrameDimensions(recipeKey);
  if (!dims) {
    const frameW = BODY_W + 2 * (PORT_W + GUTTER);
    const frameH = 196;
    return {
      x: anchorInFlow.x - frameW / 2,
      y: anchorInFlow.y - frameH / 2,
    };
  }

  const recipe = findRecipeByKey(recipeKey)!;
  const rates = itemRatesForRecipe(recipe);
  const inPerm = normalizePortSlotPermutation(
    dims.inCount,
    slotPerm?.inputSlotByRecipeIndex,
  );
  const outPerm = normalizePortSlotPermutation(
    dims.outCount,
    slotPerm?.outputSlotByRecipeIndex,
  );

  let local: { x: number; y: number };
  if (anchor.mode === "frameCenter") {
    local = { x: dims.frameW / 2, y: dims.frameH / 2 };
  } else {
    const rows = anchor.kind === "in" ? rates.inputs : rates.outputs;
    let recipeIdx = rows.findIndex((r) => r.itemId === anchor.itemId);
    if (recipeIdx < 0) recipeIdx = 0;
    local = portLocalCenter(anchor.kind, recipeIdx, inPerm, outPerm, dims);
  }

  return {
    x: anchorInFlow.x - local.x,
    y: anchorInFlow.y - local.y,
  };
}

/** Construit le cadre machine + un nœud port par entrée/sortie de recette. */
export function buildMachineNodes(bp: MachineBlueprint): Node[] {
  const recipe = findRecipeByKey(bp.recipeKey);
  if (!recipe) {
    const pid = bp.id;
    const frameW = BODY_W + 2 * (PORT_W + GUTTER);
    return [
      {
        id: pid,
        type: "machineFrame",
        position: bp.position,
        style: { width: frameW, height: 196 },
        connectable: false,
        draggable: true,
        selectable: true,
        deletable: true,
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
  const dims = getMachineFrameDimensions(bp.recipeKey)!;
  const frameW = dims.frameW;
  const frameH = dims.frameH;

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
      selectable: true,
      deletable: true,
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
      deletable: true,
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
      deletable: true,
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
