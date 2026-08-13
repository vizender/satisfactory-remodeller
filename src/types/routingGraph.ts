import type { OrthoNorm, OrthoPoint } from "@/types/edgeData";

/** Endpoint of a shared routing segment. */
export type RoutingEndpoint =
  | { kind: "port"; portId: string }
  | { kind: "junction"; junctionId: string };

export type RoutingJunction = {
  id: string;
  x: number;
  y: number;
};

/**
 * One orthogonal run between two endpoints (port or junction).
 * Drawn and edited once; many logical links may traverse it.
 */
export type RoutingSegment = {
  id: string;
  itemId: string;
  a: RoutingEndpoint;
  b: RoutingEndpoint;
  /**
   * Optional interior corners as fractions of the a→b box (same convention as
   * ItemEdgeData.cornersNorm). Empty / absent = straight ortholinear a→b.
   */
  cornersNorm?: OrthoNorm[];
};

export type RoutingGraph = {
  version: 1;
  junctions: Record<string, RoutingJunction>;
  segments: Record<string, RoutingSegment>;
};

export function emptyRoutingGraph(): RoutingGraph {
  return { version: 1, junctions: {}, segments: {} };
}

export function isRoutingGraph(value: unknown): value is RoutingGraph {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.junctions === "object" &&
    o.junctions !== null &&
    typeof o.segments === "object" &&
    o.segments !== null
  );
}

export function endpointKey(ep: RoutingEndpoint): string {
  return ep.kind === "port" ? `p:${ep.portId}` : `j:${ep.junctionId}`;
}

/** Stable id for a segment between two endpoints (undirected). */
export function segmentIdFor(a: RoutingEndpoint, b: RoutingEndpoint): string {
  const ka = endpointKey(a);
  const kb = endpointKey(b);
  return ka < kb ? `rs-${ka}__${kb}` : `rs-${kb}__${ka}`;
}

export function junctionNodeId(junctionId: string): string {
  return `rj-${junctionId}`;
}

export function parseJunctionNodeId(nodeId: string): string | null {
  return nodeId.startsWith("rj-") ? nodeId.slice(3) : null;
}

export function routingSegmentEdgeId(segmentId: string): string {
  return segmentId.startsWith("rs-") ? segmentId : `rs-${segmentId}`;
}

export type RoutingSegmentEdgeData = {
  kind: "routingSegment";
  segmentId: string;
  itemId: string;
  cornersNorm?: OrthoNorm[];
  /** Absolute corners while dragging (not persisted). */
  dragCorners?: OrthoPoint[];
};
