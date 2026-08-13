import type { Edge, Node } from "@xyflow/react";
import type { RoutingGraph } from "@/types/routingGraph";

export const WORLD_CANVAS_ID = "world" as const;
export const WORLD_CANVAS_NAME = "World" as const;
export const MAX_CANVAS_DEPTH = 10;

export type CanvasId = string;

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Reserved: canvas-level theming (background, grid, etc.). */
export interface CanvasAppearanceV1 {
  version: 1;
  backgroundVariant?: string;
}

export interface CanvasParentLink {
  canvasId: CanvasId;
  /** Same as the sub-canvas id (factory node id on parent). */
  factoryNodeId: CanvasId;
}

export interface CanvasRecord {
  id: CanvasId;
  name: string;
  nodes: Node[];
  edges: Edge[];
  forcedPortRates: Record<string, number | undefined>;
  /** Shared N×M routing graph (junctions + segments). */
  routingGraph?: RoutingGraph;
  parent?: CanvasParentLink;
  viewport?: CanvasViewport;
  appearance?: CanvasAppearanceV1;
}

export interface BreadcrumbItem {
  canvasId: CanvasId;
  name: string;
  depth: number;
}
