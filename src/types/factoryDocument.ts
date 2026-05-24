import type { CanvasId, CanvasRecord } from "@/types/canvas";
import { WORLD_CANVAS_ID } from "@/types/canvas";

export const FACTORY_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const FACTORY_DOCUMENT_SCHEMA_VERSION_V2 = 2 as const;

export interface FactoryDocumentMeta {
  title: string;
  updatedAt: string;
}

export interface FactoryDocumentMetaV2 {
  updatedAt: string;
  exportTitle?: string;
}

/** @deprecated Legacy flat document — migrated to v2 on load. */
export interface FactoryDocumentV1 {
  schemaVersion: typeof FACTORY_DOCUMENT_SCHEMA_VERSION;
  nodes: import("@xyflow/react").Node[];
  edges: import("@xyflow/react").Edge[];
  forcedPortRates: Record<string, number | undefined>;
  meta: FactoryDocumentMeta;
}

export interface FactoryDocumentV2 {
  schemaVersion: typeof FACTORY_DOCUMENT_SCHEMA_VERSION_V2;
  rootCanvasId: typeof WORLD_CANVAS_ID;
  canvases: Record<CanvasId, CanvasRecord>;
  meta: FactoryDocumentMetaV2;
  /** Highest factory number used for auto-increment naming. */
  factoryNameCounter?: number;
}

export type FactoryDocument = FactoryDocumentV2;

/** Subtree export wraps a factory canvas and all descendants. */
export interface CanvasSubtreeExportV1 {
  exportKind: "canvas-subtree";
  schemaVersion: 1;
  rootFactoryId: CanvasId;
  canvases: Record<CanvasId, CanvasRecord>;
  factoryNameCounter?: number;
}
