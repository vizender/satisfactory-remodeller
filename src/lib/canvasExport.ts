import type { Edge, Node } from "@xyflow/react";
import { buildFactoryNode } from "@/lib/buildFactoryGraph";
import {
  collectDescendantCanvasIds,
  createChildCanvasRecord,
  deriveFactoryNameCounter,
  nextFactoryLabel,
  sliceActiveCanvas,
  syncFactoryNodeLabel,
} from "@/lib/canvasTree";
import type { CanvasId, CanvasRecord } from "@/types/canvas";
import {
  type CanvasSubtreeExportV1,
  type FactoryDocumentV2,
} from "@/types/factoryDocument";
import type { FactoryFrameData } from "@/types/graph";

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

/** Deep-clone a factory subtree with fresh ids. Returns new root factory id. */
export function cloneFactorySubtree(
  canvases: Record<CanvasId, CanvasRecord>,
  sourceFactoryId: CanvasId,
  position: { x: number; y: number },
): {
  canvases: Record<CanvasId, CanvasRecord>;
  newRootId: CanvasId;
  node: Node;
} {
  const ids = collectDescendantCanvasIds(canvases, sourceFactoryId);
  const idMap = new Map<string, string>();

  for (const oldId of ids) {
  if (oldId === sourceFactoryId) {
      idMap.set(oldId, nextFactoryIdFromMap(canvases, idMap));
    } else {
      idMap.set(oldId, nextFactoryIdFromMap(canvases, idMap));
    }
  }

  const parentCanvasId =
    canvases[sourceFactoryId]?.parent?.canvasId ?? "world";
  const { label } = nextFactoryLabel(canvases, parentCanvasId);
  const newRootId = idMap.get(sourceFactoryId)!;

  const nextCanvases = { ...canvases };
  for (const oldId of ids) {
    const src = canvases[oldId];
    const newId = idMap.get(oldId)!;
    const remappedNodes = remapNodes(src.nodes, idMap);
    const remappedEdges = remapEdges(src.edges, idMap);
    const remappedForced = remapForcedRates(src.forcedPortRates, idMap);

    let parent = src.parent;
    if (parent) {
      parent = {
        canvasId: idMap.get(parent.canvasId) ?? parent.canvasId,
        factoryNodeId: idMap.get(parent.factoryNodeId) ?? parent.factoryNodeId,
      };
    }

    const name =
      oldId === sourceFactoryId
        ? label
        : src.name;

    nextCanvases[newId] = {
      ...src,
      id: newId,
      name,
      parent,
      nodes: remappedNodes,
      edges: remappedEdges,
      forcedPortRates: remappedForced,
    };
  }

  const sourceNode = canvases[sourceFactoryId]?.nodes.find(
    (n) => n.id === sourceFactoryId,
  );
  const node = buildFactoryNode(newRootId, position, label, {
    ...(sourceNode?.data as FactoryFrameData),
    label,
  });

  return {
    canvases: nextCanvases,
    newRootId,
    node,
  };
}

function nextFactoryIdFromMap(
  canvases: Record<CanvasId, CanvasRecord>,
  idMap: Map<string, string>,
): string {
  const used = new Set([
    ...Object.values(canvases).flatMap((c) =>
      c.nodes.filter((n) => n.type === "factoryFrame").map((n) => n.id),
    ),
    ...idMap.values(),
  ]);
  let i = 1;
  while (used.has(`f${i}`)) i += 1;
  return `f${i}`;
}

function remapNodes(nodes: Node[], idMap: Map<string, string>): Node[] {
  return nodes.map((n) => {
    const newId = idMap.get(n.id) ?? n.id;
    const parentId = n.parentId ? idMap.get(n.parentId) ?? n.parentId : undefined;
    return { ...structuredClone(n), id: newId, parentId };
  });
}

function remapEdges(edges: Edge[], idMap: Map<string, string>): Edge[] {
  return edges.map((e) => ({
    ...structuredClone(e),
    id: `e-${idMap.get(e.source) ?? e.source}-${idMap.get(e.target) ?? e.target}-${crypto.randomUUID().slice(0, 8)}`,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }));
}

function remapForcedRates(
  rates: Record<string, number | undefined>,
  idMap: Map<string, string>,
): Record<string, number | undefined> {
  const next: Record<string, number | undefined> = {};
  for (const [k, v] of Object.entries(rates)) {
    next[idMap.get(k) ?? k] = v;
  }
  return next;
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
  const idMap = new Map<string, string>();
  const exportIds = collectDescendantCanvasIds(
    exportDoc.canvases,
    exportDoc.rootFactoryId,
  );

  for (const oldId of exportIds) {
    idMap.set(oldId, nextFactoryIdFromMap(canvases, idMap));
  }

  const newRootId = idMap.get(exportDoc.rootFactoryId)!;
  const srcRoot = exportDoc.canvases[exportDoc.rootFactoryId];
  const { label } = nextFactoryLabel(canvases, parentCanvasId);

  const nextCanvases = { ...canvases };

  for (const oldId of exportIds) {
    const src = exportDoc.canvases[oldId];
    const newId = idMap.get(oldId)!;
    const remappedNodes = remapNodes(src.nodes, idMap);
    const remappedEdges = remapEdges(src.edges, idMap);
    const remappedForced = remapForcedRates(src.forcedPortRates, idMap);

    let parent = src.parent;
    if (oldId === exportDoc.rootFactoryId) {
      parent = { canvasId: parentCanvasId, factoryNodeId: newId };
    } else if (parent) {
      parent = {
        canvasId: idMap.get(parent.canvasId)!,
        factoryNodeId: idMap.get(parent.factoryNodeId)!,
      };
    }

    nextCanvases[newId] = {
      ...structuredClone(src),
      id: newId,
      name: oldId === exportDoc.rootFactoryId ? label : src.name,
      parent,
      nodes: remappedNodes,
      edges: remappedEdges,
      forcedPortRates: remappedForced,
    };
  }

  const factoryNode = buildFactoryNode(newRootId, position, label, {
    ...(srcRoot.nodes.find((n) => n.id === exportDoc.rootFactoryId)
      ?.data as FactoryFrameData),
    label,
  });

  const parent = nextCanvases[parentCanvasId];
  nextCanvases[parentCanvasId] = {
    ...parent,
    nodes: [...parent.nodes, factoryNode],
  };

  return { canvases: nextCanvases, newRootId };
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
        nodes: syncFactoryNodeLabel(next[parentCanvasId].nodes, factoryId, name),
      },
    };
  }
  return next;
}

export { sliceActiveCanvas, createChildCanvasRecord };
