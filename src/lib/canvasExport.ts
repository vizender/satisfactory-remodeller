import { pasteCanvasSelection } from "./canvasClipboard";
import { buildFactoryNode } from "@/lib/buildFactoryGraph";
import {
  collectDescendantCanvasIds,
  createChildCanvasRecord,
  deriveFactoryNameCounter,
  sliceActiveCanvas,
  syncFactoryNodeLabel,
} from "@/lib/canvasTree";
import type { CanvasId, CanvasRecord } from "@/types/canvas";
import {
  type CanvasSubtreeExportV1,
  type FactoryDocumentV2,
} from "@/types/factoryDocument";

export function buildWorldDocument(
  canvases: Record<CanvasId, CanvasRecord>,
  meta: FactoryDocumentV2["meta"],
): FactoryDocumentV2 {
  return {
    schemaVersion: 2,
    rootCanvasId: "world",
    canvases: structuredClone(canvases),
    meta: { ...meta, updatedAt: new Date().toISOString() },
    factoryNameCounter: deriveFactoryNameCounter(canvases),
  };
}

export function buildCanvasSubtreeExport(
  canvases: Record<CanvasId, CanvasRecord>,
  rootCanvasId: CanvasId,
): CanvasSubtreeExportV1 {
  const ids = collectDescendantCanvasIds(canvases, rootCanvasId);
  const subset: Record<CanvasId, CanvasRecord> = {};
  for (const id of ids) {
    subset[id] = structuredClone(canvases[id]);
  }
  return {
    exportKind: "canvas-subtree",
    schemaVersion: 1,
    rootFactoryId: rootCanvasId,
    canvases: subset,
    factoryNameCounter: deriveFactoryNameCounter(subset),
  };
}

export function isCanvasSubtreeExport(
  value: unknown,
): value is CanvasSubtreeExportV1 {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    o.exportKind === "canvas-subtree" &&
    o.schemaVersion === 1 &&
    typeof o.rootFactoryId === "string" &&
    typeof o.canvases === "object" &&
    o.canvases !== null
  );
}

/** Merge an imported subtree under `parentCanvasId` at `position`. */
export function mergeImportedSubtree(
  canvases: Record<CanvasId, CanvasRecord>,
  parentCanvasId: CanvasId,
  exportDoc: CanvasSubtreeExportV1,
  position: { x: number; y: number },
): {
  canvases: Record<CanvasId, CanvasRecord>;
  newRootId: CanvasId;
} {
  const src = exportDoc.canvases[exportDoc.rootFactoryId];
  const root: CanvasRecord = {
    id: "clipboard-root",
    name: "",
    nodes: [buildFactoryNode(src.id, { x: 0, y: 0 }, src.name)],
    edges: [],
    forcedPortRates: {},
  };
  const descendants = Object.fromEntries(
    collectDescendantCanvasIds(exportDoc.canvases, src.id).map((id) => [
      id,
      exportDoc.canvases[id],
    ]),
  );
  const next = pasteCanvasSelection(
    canvases,
    parentCanvasId,
    { root, descendants },
    position,
  );
  const newRootId = next[parentCanvasId].nodes.find(
    (n) => n.type === "factoryFrame" && n.selected,
  )?.id;
  if (!newRootId) throw new Error("Cannot import nested factory here");
  return { canvases: next, newRootId };
}

export function renameFactoryAcrossTree(
  canvases: Record<CanvasId, CanvasRecord>,
  factoryId: CanvasId,
  name: string,
): Record<CanvasId, CanvasRecord> {
  const canvas = canvases[factoryId];
  if (!canvas) return canvases;
  const parentCanvasId = canvas.parent?.canvasId;
  let next = {
    ...canvases,
    [factoryId]: { ...canvas, name },
  };
  if (parentCanvasId && next[parentCanvasId]) {
    next = {
      ...next,
      [parentCanvasId]: {
        ...next[parentCanvasId],
        nodes: syncFactoryNodeLabel(
          next[parentCanvasId].nodes,
          factoryId,
          name,
        ),
      },
    };
  }
  return next;
}

export { sliceActiveCanvas, createChildCanvasRecord };
