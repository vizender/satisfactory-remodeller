export type {
  Aabb,
  Axis,
  CrossingHop,
  DeleteSegmentResult,
  Point,
  PortHandle,
  PortKind,
  RouteGraph,
  RouteNet,
  RouteSegment,
  RouteVertex,
  TopologyEdge,
  VertexKind,
} from "./types";
export { cloneRouteGraph, emptyRouteGraph } from "./types";

export {
  BACKWARDS_STUB,
  FORWARD_MIN_GAP,
  HOP_RADIUS,
  KINK_JOG,
  MIN_PORT_STUB,
  MIN_SEG,
  REVERSE_CLEARANCE,
  SNAP_ALIGN,
  SNAP_ALIGN_SCREEN,
  STUB_LEN,
} from "./constants";

export { resetRouteIds, syncRouteIds } from "./ids";
export { portHandlesFromNodes, topologyEdgesFromFlow } from "./ports";
export {
  addTopologyEdge,
  buildRouteGraph,
  layoutReverseNet,
  needsReverseWrap,
  reverseBusY,
  stubsOverlap,
} from "./layout";
export {
  collapseGraph,
  sanitizeRouteGraph,
  netIdsTouchingPorts,
} from "./collapse";
export { deleteSegment, pruneRouteGraph, removeTopologyEdge } from "./delete";
export { dragSegment, kinkSegment, mergeVerticesIfPossible } from "./ops";
export { snapDragPointer, type AlignHit, type DragSnapOpts } from "./snap";
export { computeHops } from "./hops";
export { nextSegmentSelection } from "./selection";
export { applyMachineDrag, followPortVertices } from "./machineDrag";
export {
  flowOnSegment,
  nearestSegmentId,
  pathForEdge,
  segmentEdgeUsers,
  segmentMidpoint,
} from "./paths";
export {
  assertInvariants,
  collectInvariantIssues,
  countByAxis,
  countByKind,
} from "./invariants";
export { groupEdgesIntoNets, isPortGluedH, degreeOf, vertexByPort } from "./nets";
export { snap, distToSegment, hvIntersection } from "./geometry";
