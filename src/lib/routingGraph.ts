import type { Edge, Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import { snapToGrid } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  buildEdgeNetworkIds,
  FORWARD_MIN_GAP,
  interiorCorners,
  resolveRoutePoints,
} from "@/lib/orthogonalEdgePath";
import type { OrthoNorm, OrthoPoint, RouteAnchor } from "@/types/edgeData";
import { isItemEdgeData, type ItemEdgeData } from "@/types/edgeData";
import {
  emptyRoutingGraph,
  endpointKey,
  junctionNodeId,
  segmentIdFor,
  type RoutingEndpoint,
  type RoutingGraph,
  type RoutingJunction,
  type RoutingSegment,
  type RoutingSegmentEdgeData,
} from "@/types/routingGraph";

export { emptyRoutingGraph };

const { PORT_ROW, PORT_W } = MACHINE_LAYOUT;
const BUS_INSET = 40;

export function portAbsPos(
  nodes: Node[],
  portId: string,
): { x: number; y: number } | null {
  const port = nodes.find((n) => n.id === portId && n.type === "itemPort");
  if (!port?.parentId) return null;
  const frame = nodes.find((n) => n.id === port.parentId);
  if (!frame) return null;
  const kind = (port.data as { kind?: string })?.kind;
  const localX = kind === "out" ? port.position.x + PORT_W : port.position.x;
  return {
    x: frame.position.x + localX,
    y: frame.position.y + port.position.y + PORT_ROW / 2,
  };
}

function portKind(nodes: Node[], portId: string): "in" | "out" | null {
  const port = nodes.find((n) => n.id === portId && n.type === "itemPort");
  const kind = (port?.data as { kind?: string } | undefined)?.kind;
  return kind === "in" || kind === "out" ? kind : null;
}

function logicalEdgesOnly(edges: Edge[]): Edge[] {
  return edges.filter((e) => {
    const d = e.data as { kind?: string; suggested?: boolean } | undefined;
    if (d?.kind === "routingSegment") return false;
    if (d?.suggested) return false;
    return true;
  });
}

/** Preserve cornersNorm keyed by segment id across rebuilds. */
function prevCornersMap(prev: RoutingGraph | undefined): Map<string, OrthoNorm[]> {
  const out = new Map<string, OrthoNorm[]>();
  if (!prev) return out;
  for (const s of Object.values(prev.segments)) {
    if (s.cornersNorm && s.cornersNorm.length >= 2) {
      out.set(s.id, s.cornersNorm);
    }
  }
  return out;
}

function pickBusX(
  nodes: Node[],
  portIds: string[],
  prev: RoutingGraph | undefined,
  networkJunctionIds: string[],
): number {
  if (prev) {
    const xs: number[] = [];
    for (const id of networkJunctionIds) {
      const j = prev.junctions[id];
      if (j) xs.push(j.x);
    }
    // Also match by port-derived junction ids from previous rebuild
    for (const pid of portIds) {
      const j = prev.junctions[`j-${pid}`];
      if (j) xs.push(j.x);
    }
    if (xs.length > 0) {
      return snapToGrid(xs.reduce((a, b) => a + b, 0) / xs.length);
    }
  }

  let minOut = Infinity;
  let maxOut = -Infinity;
  let minIn = Infinity;
  let maxIn = -Infinity;
  let hasOut = false;
  let hasIn = false;
  for (const pid of portIds) {
    const pos = portAbsPos(nodes, pid);
    if (!pos) continue;
    const kind = portKind(nodes, pid);
    if (kind === "out") {
      hasOut = true;
      minOut = Math.min(minOut, pos.x);
      maxOut = Math.max(maxOut, pos.x);
    } else if (kind === "in") {
      hasIn = true;
      minIn = Math.min(minIn, pos.x);
      maxIn = Math.max(maxIn, pos.x);
    }
  }

  if (hasOut && hasIn) {
    const left = maxOut + BUS_INSET;
    const right = minIn - BUS_INSET;
    if (right - left >= FORWARD_MIN_GAP) {
      return snapToGrid((left + right) / 2);
    }
    return snapToGrid((maxOut + minIn) / 2);
  }
  if (hasOut) return snapToGrid(maxOut + BUS_INSET + 40);
  if (hasIn) return snapToGrid(minIn - BUS_INSET - 40);
  return 0;
}

function ensureSegment(
  graph: RoutingGraph,
  itemId: string,
  a: RoutingEndpoint,
  b: RoutingEndpoint,
  cornersPrev: Map<string, OrthoNorm[]>,
): string {
  const id = segmentIdFor(a, b);
  if (!graph.segments[id]) {
    const seg: RoutingSegment = { id, itemId, a, b };
    const prev = cornersPrev.get(id);
    if (prev) seg.cornersNorm = prev;
    graph.segments[id] = seg;
  }
  return id;
}

function buildNetworkBus(
  graph: RoutingGraph,
  nodes: Node[],
  netEdges: Edge[],
  netId: string,
  cornersPrev: Map<string, OrthoNorm[]>,
  prev: RoutingGraph | undefined,
): Map<string, string[]> {
  const routePaths = new Map<string, string[]>();
  const portIds = new Set<string>();
  let itemId = "unknown";
  for (const e of netEdges) {
    portIds.add(e.source);
    portIds.add(e.target);
    if (isItemEdgeData(e.data)) itemId = e.data.itemId;
  }
  const ports = [...portIds];
  const junctionIds = ports.map((p) => `j-${p}`);
  const busX = pickBusX(nodes, ports, prev, junctionIds);

  const portJunction = new Map<string, string>();
  // Group ports that share the same bus Y so they attach to one junction
  const byY = new Map<number, string[]>();
  for (const pid of ports) {
    const pos = portAbsPos(nodes, pid);
    if (!pos) continue;
    const y = snapToGrid(pos.y);
    let list = byY.get(y);
    if (!list) {
      list = [];
      byY.set(y, list);
    }
    list.push(pid);
  }

  for (const [y, group] of byY) {
    // Stable id from sorted port ids in the Y-group
    const jid = `j-${[...group].sort().join("_")}`;
    const old =
      prev?.junctions[jid] ??
      group.map((p) => prev?.junctions[`j-${p}`]).find(Boolean);
    const junction: RoutingJunction = {
      id: jid,
      x: old && Number.isFinite(old.x) ? old.x : busX,
      y,
    };
    graph.junctions[jid] = junction;
    for (const pid of group) {
      portJunction.set(pid, jid);
      const kind = portKind(nodes, pid);
      const portEp: RoutingEndpoint = { kind: "port", portId: pid };
      const jEp: RoutingEndpoint = { kind: "junction", junctionId: jid };
      if (kind === "out") {
        ensureSegment(graph, itemId, portEp, jEp, cornersPrev);
      } else {
        ensureSegment(graph, itemId, jEp, portEp, cornersPrev);
      }
    }
  }

  const sorted = [...portJunction.values()]
    .map((jid) => graph.junctions[jid]!)
    .filter(Boolean)
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));

  // Deduplicate visually coincident junctions for bus links: still keep per-port
  // junctions, but skip zero-length verticals.
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (Math.abs(a.y - b.y) < 0.51 && Math.abs(a.x - b.x) < 0.51) continue;
    ensureSegment(
      graph,
      itemId,
      { kind: "junction", junctionId: a.id },
      { kind: "junction", junctionId: b.id },
      cornersPrev,
    );
  }

  const sortedIds = sorted.map((j) => j.id);

  const stubId = (pid: string): string | null => {
    const jid = portJunction.get(pid);
    if (!jid) return null;
    const kind = portKind(nodes, pid);
    const portEp: RoutingEndpoint = { kind: "port", portId: pid };
    const jEp: RoutingEndpoint = { kind: "junction", junctionId: jid };
    return kind === "out" ? segmentIdFor(portEp, jEp) : segmentIdFor(jEp, portEp);
  };

  const busSegmentsBetween = (jFrom: string, jTo: string): string[] => {
    if (jFrom === jTo) return [];
    const i = sortedIds.indexOf(jFrom);
    const j = sortedIds.indexOf(jTo);
    if (i < 0 || j < 0) return [];
    const ids: string[] = [];
    if (i < j) {
      for (let k = i; k < j; k++) {
        const a = sortedIds[k]!;
        const b = sortedIds[k + 1]!;
        const ja = graph.junctions[a]!;
        const jb = graph.junctions[b]!;
        if (Math.abs(ja.y - jb.y) < 0.51 && Math.abs(ja.x - jb.x) < 0.51) {
          continue;
        }
        ids.push(
          segmentIdFor(
            { kind: "junction", junctionId: a },
            { kind: "junction", junctionId: b },
          ),
        );
      }
    } else {
      for (let k = i; k > j; k--) {
        const a = sortedIds[k]!;
        const b = sortedIds[k - 1]!;
        const ja = graph.junctions[a]!;
        const jb = graph.junctions[b]!;
        if (Math.abs(ja.y - jb.y) < 0.51 && Math.abs(ja.x - jb.x) < 0.51) {
          continue;
        }
        ids.push(
          segmentIdFor(
            { kind: "junction", junctionId: a },
            { kind: "junction", junctionId: b },
          ),
        );
      }
    }
    return ids;
  };

  for (const e of netEdges) {
    const jSrc = portJunction.get(e.source);
    const jTgt = portJunction.get(e.target);
    const sStub = stubId(e.source);
    const tStub = stubId(e.target);
    if (!jSrc || !jTgt || !sStub || !tStub) continue;
    const path = [sStub, ...busSegmentsBetween(jSrc, jTgt), tStub];
    routePaths.set(e.id, path);
    void netId;
  }

  return routePaths;
}

export type RoutingRebuildResult = {
  graph: RoutingGraph;
  edges: Edge[];
};

/**
 * Rebuild shared routing for every multi-edge network.
 * Single-edge networks keep classic per-edge orthogonal geometry (no routePath).
 */
export function rebuildRoutingGraph(
  nodes: Node[],
  edges: Edge[],
  prev?: RoutingGraph,
): RoutingRebuildResult {
  const logical = logicalEdgesOnly(edges);
  const edgeNet = buildEdgeNetworkIds(logical);
  const byNet = new Map<string, Edge[]>();
  for (const e of logical) {
    const nid = edgeNet.get(e.id);
    if (!nid) continue;
    let list = byNet.get(nid);
    if (!list) {
      list = [];
      byNet.set(nid, list);
    }
    list.push(e);
  }

  const graph = emptyRoutingGraph();
  const cornersPrev = prevCornersMap(prev);
  const pathByEdge = new Map<string, string[]>();

  for (const [netId, netEdges] of byNet) {
    if (netEdges.length < 2) continue;
    const paths = buildNetworkBus(
      graph,
      nodes,
      netEdges,
      netId,
      cornersPrev,
      prev,
    );
    for (const [eid, path] of paths) pathByEdge.set(eid, path);
  }

  const nextEdges = edges.map((e) => {
    if (!isItemEdgeData(e.data)) return e;
    const path = pathByEdge.get(e.id);
    const prevData = e.data as ItemEdgeData;
    if (!path) {
      if (!prevData.routePath) return e;
      const { routePath: _r, ...rest } = prevData;
      return { ...e, data: rest };
    }
    return {
      ...e,
      data: { ...prevData, routePath: path } satisfies ItemEdgeData,
    };
  });

  return { graph, edges: nextEdges };
}

/** Keep junction Y aligned with live port positions for port-derived junctions. */
export function syncRoutingJunctionPositions(
  nodes: Node[],
  graph: RoutingGraph,
): RoutingGraph {
  let changed = false;
  const junctions = { ...graph.junctions };
  for (const j of Object.values(graph.junctions)) {
    // Junction ids are `j-${portId}` or `j-${p1}_${p2}_...` for Y-groups
    if (!j.id.startsWith("j-")) continue;
    const portIds = j.id.slice(2).split("_");
    const ys: number[] = [];
    for (const portId of portIds) {
      const pos = portAbsPos(nodes, portId);
      if (pos) ys.push(pos.y);
    }
    if (ys.length === 0) continue;
    const y = snapToGrid(ys.reduce((a, b) => a + b, 0) / ys.length);
    if (Math.abs(j.y - y) > 0.01) {
      junctions[j.id] = { ...j, y };
      changed = true;
    }
  }
  return changed ? { ...graph, junctions } : graph;
}

export function endpointNodeId(ep: RoutingEndpoint): string {
  return ep.kind === "port" ? ep.portId : junctionNodeId(ep.junctionId);
}

export function endpointHandleId(
  ep: RoutingEndpoint,
  role: "source" | "target",
): string {
  if (ep.kind === "port") return "item";
  return role === "source" ? "js" : "jt";
}

export function resolveEndpointPos(
  ep: RoutingEndpoint,
  nodes: Node[],
  graph: RoutingGraph,
): OrthoPoint | null {
  if (ep.kind === "port") return portAbsPos(nodes, ep.portId);
  const j = graph.junctions[ep.junctionId];
  return j ? { x: j.x, y: j.y } : null;
}

/** Absolute polyline for one routing segment. */
export function resolveSegmentPoints(
  segment: RoutingSegment,
  nodes: Node[],
  graph: RoutingGraph,
  edgeIdForPreview?: string,
): OrthoPoint[] | null {
  const a = resolveEndpointPos(segment.a, nodes, graph);
  const b = resolveEndpointPos(segment.b, nodes, graph);
  if (!a || !b) return null;
  // Axis-aligned stubs/bus runs stay as a single straight stroke by default.
  if (!segment.cornersNorm || segment.cornersNorm.length < 2) {
    if (Math.abs(a.y - b.y) < 0.51 || Math.abs(a.x - b.x) < 0.51) {
      return [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
    }
  }
  const data = segment.cornersNorm
    ? { itemId: segment.itemId, cornersNorm: segment.cornersNorm }
    : { itemId: segment.itemId };
  return resolveRoutePoints(a.x, a.y, b.x, b.y, data, edgeIdForPreview);
}

/** Compose absolute points for a logical edge that has a routePath. */
export function composeLogicalRoutePoints(
  edge: Edge,
  nodes: Node[],
  graph: RoutingGraph,
): OrthoPoint[] | null {
  if (!isItemEdgeData(edge.data) || !edge.data.routePath?.length) return null;
  const pts: OrthoPoint[] = [];
  for (const sid of edge.data.routePath) {
    const seg = graph.segments[sid];
    if (!seg) return null;
    let segPts = resolveSegmentPoints(seg, nodes, graph, sid);
    if (!segPts || segPts.length < 2) return null;
    // Orient segment so it continues from the previous joint
    if (pts.length > 0) {
      const prev = pts[pts.length - 1]!;
      const start = segPts[0]!;
      const end = segPts[segPts.length - 1]!;
      const distStart = Math.hypot(prev.x - start.x, prev.y - start.y);
      const distEnd = Math.hypot(prev.x - end.x, prev.y - end.y);
      if (distEnd + 0.5 < distStart) {
        segPts = [...segPts].reverse();
      }
      for (let i = 1; i < segPts.length; i++) pts.push(segPts[i]!);
    } else {
      pts.push(...segPts);
    }
  }
  return pts.length >= 2 ? pts : null;
}

export function setSegmentCornersNorm(
  graph: RoutingGraph,
  segmentId: string,
  corners: OrthoPoint[] | undefined,
  anchor: RouteAnchor | undefined,
): RoutingGraph {
  const seg = graph.segments[segmentId];
  if (!seg) return graph;
  const next = { ...seg };
  if (!corners || corners.length < 2 || !anchor) {
    delete next.cornersNorm;
  } else {
    const dx = anchor.tx - anchor.sx;
    const dy = anchor.ty - anchor.sy;
    next.cornersNorm = corners.map((p) => ({
      u: Math.abs(dx) < 1e-6 ? 0.5 : (p.x - anchor.sx) / dx,
      v: Math.abs(dy) < 1e-6 ? 0.5 : (p.y - anchor.sy) / dy,
    }));
  }
  return {
    ...graph,
    segments: { ...graph.segments, [segmentId]: next },
  };
}

/**
 * After a segment kink that needs a topological split: insert a junction on a
 * straight segment and replace it with two segments. For now cornersNorm on the
 * segment is enough; this helper supports explicit mid-junction splits.
 */
export function splitSegmentAtPoint(
  graph: RoutingGraph,
  segmentId: string,
  point: OrthoPoint,
): RoutingGraph {
  const seg = graph.segments[segmentId];
  if (!seg) return graph;
  const jid = `j-split-${segmentId}-${snapToGrid(point.x)}-${snapToGrid(point.y)}`;
  const junction: RoutingJunction = {
    id: jid,
    x: snapToGrid(point.x),
    y: snapToGrid(point.y),
  };
  const jEp: RoutingEndpoint = { kind: "junction", junctionId: jid };
  const left: RoutingSegment = {
    id: segmentIdFor(seg.a, jEp),
    itemId: seg.itemId,
    a: seg.a,
    b: jEp,
  };
  const right: RoutingSegment = {
    id: segmentIdFor(jEp, seg.b),
    itemId: seg.itemId,
    a: jEp,
    b: seg.b,
  };
  const segments = { ...graph.segments };
  delete segments[segmentId];
  segments[left.id] = left;
  segments[right.id] = right;
  return {
    ...graph,
    junctions: { ...graph.junctions, [jid]: junction },
    segments,
  };
}

/** Remap logical edge routePaths after a segment split. */
export function remapRoutePathsAfterSplit(
  edges: Edge[],
  oldSegmentId: string,
  replacementIds: [string, string],
): Edge[] {
  return edges.map((e) => {
    if (!isItemEdgeData(e.data) || !e.data.routePath) return e;
    if (!e.data.routePath.includes(oldSegmentId)) return e;
    const routePath: string[] = [];
    for (const sid of e.data.routePath) {
      if (sid === oldSegmentId) {
        routePath.push(replacementIds[0], replacementIds[1]);
      } else {
        routePath.push(sid);
      }
    }
    return { ...e, data: { ...e.data, routePath } };
  });
}

export function buildJunctionNodes(graph: RoutingGraph): Node[] {
  return Object.values(graph.junctions).map((j) => ({
    id: junctionNodeId(j.id),
    type: "routingJunction",
    position: { x: j.x, y: j.y },
    data: { junctionId: j.id },
    draggable: false,
    selectable: false,
    focusable: false,
    deletable: false,
    connectable: false,
    // React Flow skips edges until nodes are "initialized" (width + handles).
    width: 8,
    height: 8,
    initialWidth: 8,
    initialHeight: 8,
    handles: [
      {
        id: "js",
        type: "source",
        position: Position.Right,
        x: 0,
        y: 0,
        width: 8,
        height: 8,
      },
      {
        id: "jt",
        type: "target",
        position: Position.Left,
        x: 0,
        y: 0,
        width: 8,
        height: 8,
      },
    ],
    style: { width: 8, height: 8, padding: 0, margin: 0 },
    zIndex: 0,
  }));
}

export function buildSegmentEdges(
  graph: RoutingGraph,
  conflictSegmentIds?: Set<string>,
): Edge[] {
  return Object.values(graph.segments).map((seg) => {
    const data: RoutingSegmentEdgeData = {
      kind: "routingSegment",
      segmentId: seg.id,
      itemId: seg.itemId,
      cornersNorm: seg.cornersNorm,
    };
    return {
      id: seg.id,
      type: "routingSegment",
      source: endpointNodeId(seg.a),
      target: endpointNodeId(seg.b),
      sourceHandle: endpointHandleId(seg.a, "source"),
      targetHandle: endpointHandleId(seg.b, "target"),
      data,
      className: conflictSegmentIds?.has(seg.id)
        ? "rf-edge-conflict"
        : undefined,
      deletable: false,
    } satisfies Edge;
  });
}

export function conflictSegmentIdsFromLogical(
  edges: Edge[],
  conflictEdgeIds: readonly string[],
): Set<string> {
  const set = new Set<string>();
  const conflict = new Set(conflictEdgeIds);
  for (const e of edges) {
    if (!conflict.has(e.id) || !isItemEdgeData(e.data)) continue;
    for (const sid of e.data.routePath ?? []) set.add(sid);
  }
  return set;
}

/** Hide logical edges that are drawn via shared segments. */
export function applySharedRouteVisibility(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    if (!isItemEdgeData(e.data) || !e.data.routePath?.length) {
      if (e.hidden) {
        const { hidden: _h, ...rest } = e;
        return rest as Edge;
      }
      return e;
    }
    return {
      ...e,
      hidden: true,
      interactionWidth: 0,
      selectable: false,
      focusable: false,
    };
  });
}

export function getRoutePath(data: unknown): string[] | undefined {
  if (!isItemEdgeData(data)) return undefined;
  const p = data.routePath;
  if (!Array.isArray(p) || p.length === 0) return undefined;
  return p.every((x) => typeof x === "string") ? p : undefined;
}

export function segmentNetworkEdgeId(
  segmentId: string,
  edges: Edge[],
): string | undefined {
  for (const e of edges) {
    const path = getRoutePath(e.data);
    if (path?.includes(segmentId)) return e.id;
  }
  return undefined;
}

export function countSegmentsDrawnOnce(graph: RoutingGraph): number {
  return Object.keys(graph.segments).length;
}

export function assertNoDuplicateSegmentGeometry(graph: RoutingGraph): boolean {
  const keys = new Set<string>();
  for (const s of Object.values(graph.segments)) {
    const k = [endpointKey(s.a), endpointKey(s.b)].sort().join("|");
    if (keys.has(k)) return false;
    keys.add(k);
  }
  return true;
}

/** Commit interior corners helper used by tests / store. */
export function cornersFromPoints(
  points: OrthoPoint[],
  anchor: RouteAnchor,
): OrthoNorm[] {
  return interiorCorners(points).map((p) => {
    const dx = anchor.tx - anchor.sx;
    const dy = anchor.ty - anchor.sy;
    return {
      u: Math.abs(dx) < 1e-6 ? 0.5 : (p.x - anchor.sx) / dx,
      v: Math.abs(dy) < 1e-6 ? 0.5 : (p.y - anchor.sy) / dy,
    };
  });
}
