import type { Edge, Node } from "@xyflow/react";
import {
  collectDescendantCanvasIds,
  createEmptyWorldCanvas,
  mergeCanvasGraphsForSummary,
} from "@/lib/canvasTree";
import { normalizeToV2 } from "@/lib/migrateDocument";
import {
  FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
  type FactoryDocumentV2,
} from "@/types/factoryDocument";
import { WORLD_CANVAS_ID } from "@/types/canvas";

export const LOCAL_DRAFT_STORAGE_KEY = "remodeller:local-draft";

export function createEmptyWorldDocument(): FactoryDocumentV2 {
  return {
    schemaVersion: FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
    rootCanvasId: WORLD_CANVAS_ID,
    canvases: {
      [WORLD_CANVAS_ID]: createEmptyWorldCanvas(),
    },
    meta: { updatedAt: new Date().toISOString() },
    factoryNameCounter: 0,
  };
}

export function isFactoryDocument(value: unknown): value is FactoryDocumentV2 {
  try {
    normalizeToV2(value);
    return true;
  } catch {
    return false;
  }
}

export function parseFactoryDocumentJson(
  text: string,
  errors: { invalidJson: string; invalidSchema: string } = {
    invalidJson: "Invalid JSON file.",
    invalidSchema: "Unrecognized plan format.",
  },
): FactoryDocumentV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(errors.invalidJson);
  }
  try {
    return normalizeToV2(parsed);
  } catch {
    throw new Error(errors.invalidSchema);
  }
}

export function readLocalDraft(): FactoryDocumentV2 | null {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return parseFactoryDocumentJson(raw);
  } catch {
    return null;
  }
}

export function writeLocalDraft(doc: FactoryDocumentV2): void {
  try {
    localStorage.setItem(
      LOCAL_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...doc,
        meta: { ...doc.meta, updatedAt: new Date().toISOString() },
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function exportFilename(
  doc: FactoryDocumentV2,
  suffix = "world",
): string {
  const slug = (doc.meta.exportTitle ?? suffix)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const date = doc.meta.updatedAt.slice(0, 10);
  return `factory-${slug || suffix}-${date}.json`;
}

export function downloadFactoryJson(
  doc: FactoryDocumentV2,
  filename?: string,
): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? exportFilename(doc);
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Use world document load via useWorldStore. */
export function loadFactoryDocument(doc: FactoryDocumentV2): {
  nodes: Node[];
  edges: Edge[];
  forcedPortRates: Record<string, number | undefined>;
} {
  const world = doc.canvases[WORLD_CANVAS_ID];
  if (!world) {
    return { nodes: [], edges: [], forcedPortRates: {} };
  }
  return {
    nodes: structuredClone(world.nodes) as Node[],
    edges: structuredClone(world.edges) as Edge[],
    forcedPortRates: { ...world.forcedPortRates },
  };
}

export { mergeCanvasGraphsForSummary, collectDescendantCanvasIds };

/** Legacy helper kept for any remaining v1 call sites during transition. */
export function toFactoryDocument(
  nodes: Node[],
  edges: Edge[],
  forcedPortRates: Record<string, number | undefined>,
): FactoryDocumentV2 {
  return {
    schemaVersion: FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
    rootCanvasId: WORLD_CANVAS_ID,
    canvases: {
      [WORLD_CANVAS_ID]: {
        ...createEmptyWorldCanvas(),
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        forcedPortRates: { ...forcedPortRates },
      },
    },
    meta: { updatedAt: new Date().toISOString() },
    factoryNameCounter: 0,
  };
}
