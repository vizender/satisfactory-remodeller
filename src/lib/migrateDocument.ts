import { createEmptyWorldCanvas } from "@/lib/canvasTree";
import { repairFactoryDocumentV2 } from "@/lib/repairDocument";
import {
  FACTORY_DOCUMENT_SCHEMA_VERSION,
  FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
  type FactoryDocumentV1,
  type FactoryDocumentV2,
} from "@/types/factoryDocument";
import { WORLD_CANVAS_ID } from "@/types/canvas";

export function migrateV1ToV2(doc: FactoryDocumentV1): FactoryDocumentV2 {
  return {
    schemaVersion: FACTORY_DOCUMENT_SCHEMA_VERSION_V2,
    rootCanvasId: WORLD_CANVAS_ID,
    canvases: {
      [WORLD_CANVAS_ID]: {
        ...createEmptyWorldCanvas(),
        nodes: structuredClone(doc.nodes),
        edges: structuredClone(doc.edges),
        forcedPortRates: { ...doc.forcedPortRates },
      },
    },
    meta: {
      updatedAt: doc.meta.updatedAt,
      exportTitle: doc.meta.title,
    },
    factoryNameCounter: 0,
  };
}

export function isFactoryDocumentV1(value: unknown): value is FactoryDocumentV1 {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return o.schemaVersion === FACTORY_DOCUMENT_SCHEMA_VERSION;
}

export function isFactoryDocumentV2(value: unknown): value is FactoryDocumentV2 {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (o.schemaVersion !== FACTORY_DOCUMENT_SCHEMA_VERSION_V2) return false;
  if (o.rootCanvasId !== WORLD_CANVAS_ID) return false;
  if (typeof o.canvases !== "object" || o.canvases === null) return false;
  const meta = o.meta;
  if (!meta || typeof meta !== "object") return false;
  return typeof (meta as Record<string, unknown>).updatedAt === "string";
}

export function normalizeToV2(value: unknown): FactoryDocumentV2 {
  if (isFactoryDocumentV2(value)) {
    return repairFactoryDocumentV2(value);
  }
  if (isFactoryDocumentV1(value)) {
    return repairFactoryDocumentV2(migrateV1ToV2(value));
  }
  throw new Error("INVALID_SCHEMA");
}
