import type { Edge, Node } from "@xyflow/react";
import { createEmptyWorldCanvas } from "@/lib/canvasTree";
import {
  FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
  type FactoryDocumentV2,
} from "@/types/factoryDocument";
import {
  WORLD_CANVAS_ID,
  type CanvasId,
  type CanvasRecord,
} from "@/types/canvas";
import { isItemEdgeData } from "@/types/edgeData";
import { relayoutPortFrames } from "@/lib/relayoutPortFrames";
import {
  formatItemClassId,
  isPortItemAssigned,
  type ItemPortData,
} from "@/types/graph";

const KNOWN_NODE_TYPES = new Set([
  "machineFrame",
  "itemPort",
  "factoryFrame",
  "containerFrame",
]);

/** Réaligne les libellés ports sur `formatItemClassId` (ex. Steel Plate → Steel Beam). */
function refreshItemPortDisplayNames(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    if (n.type !== "itemPort") return n;
    const d = n.data as ItemPortData;
    if (!isPortItemAssigned(d.itemId)) return n;
    const displayName = formatItemClassId(d.itemId);
    if (d.displayName === displayName) return n;
    return {
      ...n,
      data: { ...d, displayName },
    };
  });
}

function sanitizeNodes(nodes: unknown): Node[] {
  if (!Array.isArray(nodes)) return [];
  const out: Node[] = [];
  const seen = new Set<string>();
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Node;
    if (typeof n.id !== "string" || !n.id || seen.has(n.id)) continue;
    if (typeof n.type !== "string" || !KNOWN_NODE_TYPES.has(n.type)) continue;
    if (
      !n.position ||
      typeof n.position.x !== "number" ||
      typeof n.position.y !== "number"
    ) {
      continue;
    }
    seen.add(n.id);
    out.push(structuredClone(n));
  }
  return refreshItemPortDisplayNames(out);
}

function sanitizeEdges(edges: unknown, nodeIds: Set<string>): Edge[] {
  if (!Array.isArray(edges)) return [];
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const raw of edges) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Edge;
    if (typeof e.id !== "string" || !e.id || seen.has(e.id)) continue;
    if (typeof e.source !== "string" || typeof e.target !== "string") continue;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if ((e.data as { kind?: string } | undefined)?.kind === "routingSegment") {
      continue;
    }
    seen.add(e.id);
    const cloned = structuredClone(e);
    const data = isItemEdgeData(cloned.data)
      ? {
          itemId: cloned.data.itemId,
          ...(cloned.data.suggested ? { suggested: true as const } : {}),
        }
      : cloned.data;
    out.push({ ...cloned, type: "default", data });
  }
  return out;
}

function sanitizeForcedPortRates(
  forced: unknown,
  nodes: Node[],
): Record<string, number | undefined> {
  const portIds = new Set(
    nodes.filter((n) => n.type === "itemPort").map((n) => n.id),
  );
  const out: Record<string, number | undefined> = {};
  if (!forced || typeof forced !== "object") return out;
  for (const [pid, rate] of Object.entries(forced as Record<string, unknown>)) {
    if (!portIds.has(pid)) continue;
    if (typeof rate !== "number" || Number.isNaN(rate)) continue;
    out[pid] = rate;
  }
  return out;
}

function repairCanvasRecord(raw: unknown, fallbackId: CanvasId): CanvasRecord {
  const base = createEmptyWorldCanvas();
  if (!raw || typeof raw !== "object") {
    return { ...base, id: fallbackId, name: fallbackId };
  }
  const r = raw as Partial<CanvasRecord>;
  const id = typeof r.id === "string" && r.id ? r.id : fallbackId;
  const name = typeof r.name === "string" && r.name.trim() ? r.name : id;
  const nodes = relayoutPortFrames(sanitizeNodes(r.nodes));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = sanitizeEdges(r.edges, nodeIds);
  const forcedPortRates = sanitizeForcedPortRates(r.forcedPortRates, nodes);

  const record: CanvasRecord = {
    id,
    name,
    nodes,
    edges,
    forcedPortRates,
  };

  if (r.parent && typeof r.parent === "object") {
    const p = r.parent as CanvasRecord["parent"];
    if (
      p &&
      typeof p.canvasId === "string" &&
      typeof p.factoryNodeId === "string"
    ) {
      record.parent = {
        canvasId: p.canvasId,
        factoryNodeId: p.factoryNodeId,
      };
    }
  }

  if (r.viewport && typeof r.viewport === "object") {
    const v = r.viewport as CanvasRecord["viewport"];
    if (
      v &&
      typeof v.x === "number" &&
      typeof v.y === "number" &&
      typeof v.zoom === "number"
    ) {
      record.viewport = { x: v.x, y: v.y, zoom: v.zoom };
    }
  }

  if (r.appearance && typeof r.appearance === "object") {
    record.appearance = structuredClone(r.appearance);
  }

  if (r.routeGraph && typeof r.routeGraph === "object") {
    const g = r.routeGraph;
    if (
      Array.isArray(g.vertices) &&
      Array.isArray(g.segments) &&
      Array.isArray(g.nets)
    ) {
      record.routeGraph = structuredClone(g);
    }
  }

  return record;
}

/** Normalise un document v2 chargé depuis une version antérieure ou partiellement invalide. */
export function repairFactoryDocumentV2(doc: FactoryDocumentV2): FactoryDocumentV2 {
  const rawCanvases =
    doc.canvases && typeof doc.canvases === "object" ? doc.canvases : {};
  const canvases: Record<CanvasId, CanvasRecord> = {};

  for (const [key, record] of Object.entries(rawCanvases)) {
    canvases[key] = repairCanvasRecord(record, key);
  }

  if (!canvases[WORLD_CANVAS_ID]) {
    canvases[WORLD_CANVAS_ID] = createEmptyWorldCanvas();
  }

  const meta =
    doc.meta && typeof doc.meta === "object"
      ? {
          updatedAt:
            typeof doc.meta.updatedAt === "string"
              ? doc.meta.updatedAt
              : new Date().toISOString(),
          exportTitle:
            typeof doc.meta.exportTitle === "string"
              ? doc.meta.exportTitle
              : undefined,
        }
      : { updatedAt: new Date().toISOString() };

  return {
    schemaVersion: FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
    rootCanvasId: WORLD_CANVAS_ID,
    canvases,
    meta,
    factoryNameCounter:
      typeof doc.factoryNameCounter === "number" && doc.factoryNameCounter >= 0
        ? doc.factoryNameCounter
        : 0,
  };
}
