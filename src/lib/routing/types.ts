export type VertexKind = "port" | "corner" | "3si" | "4si";
export type Axis = "h" | "v";
export type PortKind = "in" | "out";

export type RouteVertex = {
  id: string;
  x: number;
  y: number;
  kind: VertexKind;
  portId?: string;
  portKind?: PortKind;
};

export type RouteSegment = {
  id: string;
  a: string;
  b: string;
  axis: Axis;
  netId: string;
};

export type RouteNet = {
  id: string;
  itemId: string;
  edgeIds: string[];
};

export type RouteGraph = {
  vertices: RouteVertex[];
  segments: RouteSegment[];
  nets: RouteNet[];
};

export type PortHandle = {
  portId: string;
  x: number;
  y: number;
  kind: PortKind;
  itemId: string;
  parentId?: string;
};

export type TopologyEdge = {
  id: string;
  source: string;
  target: string;
  itemId: string;
  suggested?: boolean;
};

export type Point = { x: number; y: number };

export type Aabb = { x: number; y: number; w: number; h: number };

export type CrossingHop = {
  /** Segment that carries the CAD arch. */
  segmentId: string;
  x: number;
  y: number;
  /** Direction of the hopped segment (arch bends perpendicular). */
  axis: Axis;
};

export type DeleteSegmentResult = {
  graph: RouteGraph;
  removedEdgeIds: string[];
};

export function emptyRouteGraph(): RouteGraph {
  return { vertices: [], segments: [], nets: [] };
}

export function cloneRouteGraph(graph: RouteGraph): RouteGraph {
  return {
    vertices: graph.vertices.map((v) => ({ ...v })),
    segments: graph.segments.map((s) => ({ ...s })),
    nets: graph.nets.map((n) => ({ ...n, edgeIds: [...n.edgeIds] })),
  };
}
