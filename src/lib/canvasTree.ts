import type { Edge, Node } from "@xyflow/react";
import {
  MAX_CANVAS_DEPTH,
  WORLD_CANVAS_ID,
  WORLD_CANVAS_NAME,
  type BreadcrumbItem,
  type CanvasId,
  type CanvasParentLink,
  type CanvasRecord,
} from "@/types/canvas";
import type { FactoryFrameData } from "@/types/graph";

export function createEmptyWorldCanvas(): CanvasRecord {
  return {
    id: WORLD_CANVAS_ID,
    name: WORLD_CANVAS_NAME,
    nodes: [],
    edges: [],
    forcedPortRates: {},
  };
}

export function getCanvasDepth(
  canvases: Record<CanvasId, CanvasRecord>,
  canvasId: CanvasId,
): number {
  let depth = 0;
  let current = canvases[canvasId];
  while (current?.parent) {
    depth += 1;
    current = canvases[current.parent.canvasId];
  }
  return depth;
}

export function getBreadcrumbPath(
  canvases: Record<CanvasId, CanvasRecord>,
  canvasId: CanvasId,
): BreadcrumbItem[] {
  const chain: BreadcrumbItem[] = [];
  let current: CanvasRecord | undefined = canvases[canvasId];
  while (current) {
    chain.unshift({
      canvasId: current.id,
      name: current.name,
      depth: 0,
    });
    current = current.parent
      ? canvases[current.parent.canvasId]
      : undefined;
  }
  return chain.map((item, i) => ({ ...item, depth: i }));
}

/** Canvas id and all nested factory canvases (inclusive). */
export function collectDescendantCanvasIds(
  canvases: Record<CanvasId, CanvasRecord>,
  rootCanvasId: CanvasId,
): CanvasId[] {
  const result: CanvasId[] = [];
  const visit = (id: CanvasId) => {
    if (!canvases[id]) return;
    result.push(id);
    for (const n of canvases[id].nodes) {
      if (n.type === "factoryFrame") visit(n.id);
    }
  };
  visit(rootCanvasId);
  return result;
}

export function factoryNodesOnCanvas(nodes: Node[]): Node[] {
  return nodes.filter((n) => n.type === "factoryFrame");
}

export function canAddNestedFactory(
  canvases: Record<CanvasId, CanvasRecord>,
  parentCanvasId: CanvasId,
): boolean {
  return getCanvasDepth(canvases, parentCanvasId) < MAX_CANVAS_DEPTH;
}

export function nextFactoryId(canvases: Record<CanvasId, CanvasRecord>): string {
  let max = 0;
  for (const c of Object.values(canvases)) {
    for (const n of c.nodes) {
      if (n.type !== "factoryFrame") continue;
      const m = /^f(\d+)$/.exec(n.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return `f${max + 1}`;
}

/** Libellé par défaut « Factory N » (usine non renommée). */
export const DEFAULT_FACTORY_LABEL_RE = /^Factory (\d+)$/i;

export function parseDefaultFactoryNumber(label: string): number | null {
  const m = DEFAULT_FACTORY_LABEL_RE.exec(label.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function labelFromFactoryNode(node: Node): string {
  return (node.data as FactoryFrameData | undefined)?.label ?? "";
}

/**
 * Numéros « Factory N » sur le canvas hôte (frères) et sur chaque usine ancêtre
 * (fil d’Ariane au-dessus du canvas actif).
 */
export function collectDefaultFactoryNumbersForPlacement(
  canvases: Record<CanvasId, CanvasRecord>,
  hostCanvasId: CanvasId,
): number[] {
  const nums: number[] = [];
  const host = canvases[hostCanvasId];
  if (host) {
    for (const n of host.nodes) {
      if (n.type !== "factoryFrame") continue;
      const parsed = parseDefaultFactoryNumber(labelFromFactoryNode(n));
      if (parsed != null) nums.push(parsed);
    }
  }

  let canvas: CanvasRecord | undefined = host;
  while (canvas?.parent) {
    const parentLink: CanvasParentLink = canvas.parent;
    const parentId: CanvasId = parentLink.canvasId;
    const factoryNodeId = parentLink.factoryNodeId;
    const parentCanvas: CanvasRecord | undefined = canvases[parentId];
    const anc = parentCanvas?.nodes.find((n: Node) => n.id === factoryNodeId);
    if (anc?.type === "factoryFrame") {
      const parsed = parseDefaultFactoryNumber(labelFromFactoryNode(anc));
      if (parsed != null) nums.push(parsed);
    }
    canvas = parentCanvas;
  }

  return nums;
}

/** Prochain libellé par défaut selon le contexte (pas de compteur global). */
export function nextFactoryLabel(
  canvases: Record<CanvasId, CanvasRecord>,
  hostCanvasId: CanvasId,
): { label: string } {
  const nums = collectDefaultFactoryNumbersForPlacement(canvases, hostCanvasId);
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return { label: `Factory ${next}` };
}

/** Max « Factory N » dans tout le document (persistance legacy). */
export function deriveFactoryNameCounter(
  canvases: Record<CanvasId, CanvasRecord>,
): number {
  let max = 0;
  for (const canvas of Object.values(canvases)) {
    for (const n of canvas.nodes) {
      if (n.type !== "factoryFrame") continue;
      const parsed = parseDefaultFactoryNumber(labelFromFactoryNode(n));
      if (parsed != null) max = Math.max(max, parsed);
    }
  }
  return max;
}

export function createChildCanvasRecord(
  factoryId: CanvasId,
  name: string,
  parentCanvasId: CanvasId,
): CanvasRecord {
  return {
    id: factoryId,
    name,
    nodes: [],
    edges: [],
    forcedPortRates: {},
    parent: { canvasId: parentCanvasId, factoryNodeId: factoryId },
  };
}

export function sliceActiveCanvas(
  record: CanvasRecord,
): Pick<CanvasRecord, "nodes" | "edges" | "forcedPortRates" | "routingGraph"> {
  return {
    nodes: structuredClone(record.nodes) as Node[],
    edges: structuredClone(record.edges) as Edge[],
    forcedPortRates: { ...record.forcedPortRates },
    routingGraph: record.routingGraph
      ? structuredClone(record.routingGraph)
      : undefined,
  };
}

export function syncFactoryLabelOnCanvas(
  canvases: Record<CanvasId, CanvasRecord>,
  factoryId: CanvasId,
  name: string,
): Record<CanvasId, CanvasRecord> {
  const canvas = canvases[factoryId];
  if (!canvas) return canvases;
  return {
    ...canvases,
    [factoryId]: { ...canvas, name },
  };
}

export function syncFactoryNodeLabel(
  nodes: Node[],
  factoryId: CanvasId,
  label: string,
): Node[] {
  return nodes.map((n) => {
    if (n.id !== factoryId || n.type !== "factoryFrame") return n;
    const d = n.data as FactoryFrameData;
    return { ...n, data: { ...d, label } satisfies FactoryFrameData };
  });
}

export function remapId(prefix: string, oldId: string, idMap: Map<string, string>): string {
  const existing = idMap.get(oldId);
  if (existing) return existing;
  const fresh = `${prefix}${idMap.size + 1}`;
  idMap.set(oldId, fresh);
  return fresh;
}

/** Merge graphs from active canvas and nested factory canvases (summary / energy). */
export function mergeCanvasGraphsForSummary(
  canvases: Record<CanvasId, CanvasRecord>,
  rootCanvasId: CanvasId,
): {
  nodes: Node[];
  edges: Edge[];
  forcedPortRates: Record<string, number | undefined>;
  nestedFactoryCount: number;
} {
  const ids = collectDescendantCanvasIds(canvases, rootCanvasId);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const forcedPortRates: Record<string, number | undefined> = {};
  let nestedFactoryCount = 0;

  for (const id of ids) {
    const c = canvases[id];
    if (!c) continue;
    if (id !== rootCanvasId) nestedFactoryCount += 1;
    for (const n of c.nodes) {
      if (n.type === "factoryFrame") continue;
      nodes.push(structuredClone(n));
    }
    edges.push(...structuredClone(c.edges));
    Object.assign(forcedPortRates, c.forcedPortRates);
  }

  return { nodes, edges, forcedPortRates, nestedFactoryCount };
}
