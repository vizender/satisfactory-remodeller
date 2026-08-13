import type { Edge, Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import { snapToGrid } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  assembleOpenPolyline,
  BACKWARDS_BUS_OFFSET,
  BACKWARDS_STUB,
  buildEdgeNetworkIds,
  FORWARD_MIN_GAP,
  interiorCorners,
  isBackwardsRoute,
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

/** Preserve absolute corners keyed by segment id across rebuilds. */
function prevCornersMap(prev: RoutingGraph | undefined): Map<string, OrthoPoint[]> {
  const out = new Map<string, OrthoPoint[]>();
  if (!prev) return out;
  for (const s of Object.values(prev.segments)) {
    if (s.cornersAbs && s.cornersAbs.length >= 1) {
      out.set(
        s.id,
        s.cornersAbs.map((p) => ({ x: p.x, y: p.y })),
      );
    }
  }
  return out;
}

/**
 * Migrate stub corners onto stable per-port segment ids so adding a new
 * input/output does not drop existing kink geometry when junction grouping
 * used to rewrite ids (j-a_b → j-a, j-b).
 */
function buildCornersPrev(
  prev: RoutingGraph | undefined,
  nodes: Node[],
): Map<string, OrthoPoint[]> {
  const out = prevCornersMap(prev);
  if (!prev) return out;
  for (const seg of Object.values(prev.segments)) {
    if (!seg.cornersAbs || seg.cornersAbs.length < 1) continue;
    const portId =
      seg.a.kind === "port"
        ? seg.a.portId
        : seg.b.kind === "port"
          ? seg.b.portId
          : null;
    if (!portId) continue;
    const kind = portKind(nodes, portId);
    if (!kind) continue;
    const portEp: RoutingEndpoint = { kind: "port", portId };
    const jEp: RoutingEndpoint = {
      kind: "junction",
      junctionId: `j-${portId}`,
    };
    const newId =
      kind === "out" ? segmentIdFor(portEp, jEp) : segmentIdFor(jEp, portEp);
    if (!out.has(newId)) {
      out.set(
        newId,
        seg.cornersAbs.map((p) => ({ x: p.x, y: p.y })),
      );
    }
  }
  return out;
}

function prevWasBackwardsLayout(prev: RoutingGraph | undefined): boolean {
  return !!prev?.junctions["j-wrap-out"];
}

/** Find a previous junction that represented this port (exact or Y-group). */
function findPrevJunctionForPort(
  prev: RoutingGraph | undefined,
  portId: string,
): RoutingJunction | undefined {
  if (!prev) return undefined;
  const exact = prev.junctions[`j-${portId}`];
  if (exact) return exact;
  for (const j of Object.values(prev.junctions)) {
    if (!j.id.startsWith("j-") || j.id.startsWith("j-wrap-")) continue;
    const members = j.id.slice(2).split("_");
    if (members.includes(portId)) return j;
  }
  return undefined;
}

type PortExtents = {
  minOut: number;
  maxOut: number;
  minIn: number;
  maxIn: number;
  hasOut: boolean;
  hasIn: boolean;
  minY: number;
  maxY: number;
};

function portExtents(nodes: Node[], portIds: string[]): PortExtents {
  let minOut = Infinity;
  let maxOut = -Infinity;
  let minIn = Infinity;
  let maxIn = -Infinity;
  let hasOut = false;
  let hasIn = false;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pid of portIds) {
    const pos = portAbsPos(nodes, pid);
    if (!pos) continue;
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
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
  return { minOut, maxOut, minIn, maxIn, hasOut, hasIn, minY, maxY };
}

function isBackwardsNetwork(ext: PortExtents): boolean {
  if (!ext.hasOut || !ext.hasIn) return false;
  // Same rule as classic edges: inputs sit at/left of outputs with no forward gap.
  return isBackwardsRoute(ext.maxOut, ext.minIn);
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

  const ext = portExtents(nodes, portIds);
  if (ext.hasOut && ext.hasIn) {
    const left = ext.maxOut + BUS_INSET;
    const right = ext.minIn - BUS_INSET;
    if (right - left >= FORWARD_MIN_GAP) {
      return snapToGrid((left + right) / 2);
    }
    return snapToGrid((ext.maxOut + ext.minIn) / 2);
  }
  if (ext.hasOut) return snapToGrid(ext.maxOut + BUS_INSET + 40);
  if (ext.hasIn) return snapToGrid(ext.minIn - BUS_INSET - 40);
  return 0;
}

/** Preserve prior rail X when rebuilding a backwards wrap network. */
function pickRailX(
  prev: RoutingGraph | undefined,
  candidateIds: string[],
  fallback: number,
  side: "out" | "in",
  ext: PortExtents,
): number {
  // Only reuse X from an existing wrap layout — forward bus X sits between
  // machines and would pin the "out rail" through the corridor after a flip.
  if (prev && prevWasBackwardsLayout(prev)) {
    const xs: number[] = [];
    for (const id of candidateIds) {
      const j = prev.junctions[id];
      if (!j) continue;
      if (side === "out" && j.x < ext.maxOut - 1) continue;
      if (side === "in" && j.x > ext.minIn + 1) continue;
      xs.push(j.x);
    }
    const wrapId = side === "out" ? "j-wrap-out" : "j-wrap-in";
    const wrap = prev.junctions[wrapId];
    if (wrap) xs.push(wrap.x);
    if (xs.length > 0) {
      return snapToGrid(xs.reduce((a, b) => a + b, 0) / xs.length);
    }
  }
  return snapToGrid(fallback);
}

function ensureSegment(
  graph: RoutingGraph,
  itemId: string,
  a: RoutingEndpoint,
  b: RoutingEndpoint,
  cornersPrev: Map<string, OrthoPoint[]>,
): string {
  const id = segmentIdFor(a, b);
  if (!graph.segments[id]) {
    const seg: RoutingSegment = { id, itemId, a, b };
    const prev = cornersPrev.get(id);
    if (prev) seg.cornersAbs = prev;
    graph.segments[id] = seg;
  }
  return id;
}

function linkVerticalChain(
  graph: RoutingGraph,
  itemId: string,
  junctions: RoutingJunction[],
  cornersPrev: Map<string, OrthoPoint[]>,
): string[] {
  const sorted = [...junctions].sort(
    (a, b) => a.y - b.y || a.id.localeCompare(b.id),
  );
  const ids = sorted.map((j) => j.id);
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
  return ids;
}

function busSegmentsAlongChain(
  graph: RoutingGraph,
  sortedIds: string[],
  jFrom: string,
  jTo: string,
): string[] {
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
}

/**
 * Backwards N×M: outs sit to the right of inputs. Route around machines via
 * an out-rail (right of outs), wrap bus (below the lower port), and in-rail
 * (left of inputs) — matching classic defaultCorners.
 */
function buildBackwardsNetworkBus(
  graph: RoutingGraph,
  nodes: Node[],
  netEdges: Edge[],
  cornersPrev: Map<string, OrthoPoint[]>,
  prev: RoutingGraph | undefined,
  ext: PortExtents,
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
  const outPorts = ports.filter((p) => portKind(nodes, p) === "out");
  const inPorts = ports.filter((p) => portKind(nodes, p) === "in");

  const outRailX = pickRailX(
    prev,
    outPorts.map((p) => `j-${p}`),
    ext.maxOut + BACKWARDS_STUB,
    "out",
    ext,
  );
  const inRailX = pickRailX(
    prev,
    inPorts.map((p) => `j-${p}`),
    ext.minIn - BACKWARDS_STUB,
    "in",
    ext,
  );

  // Prefer prior wrap Y when present; else classic maxY + offset (below).
  let wrapY = snapToGrid(ext.maxY + BACKWARDS_BUS_OFFSET);
  if (prev) {
    const prevWrap = Object.values(prev.junctions).find((j) =>
      j.id.startsWith("j-wrap-"),
    );
    if (prevWrap) wrapY = prevWrap.y;
  }

  const portJunction = new Map<string, string>();
  const outJunctions: RoutingJunction[] = [];
  const inJunctions: RoutingJunction[] = [];

  const placeRail = (
    groupPorts: string[],
    railX: number,
    bucket: RoutingJunction[],
  ) => {
    for (const pid of groupPorts) {
      const pos = portAbsPos(nodes, pid);
      if (!pos) continue;
      const jid = `j-${pid}`;
      const old = findPrevJunctionForPort(prev, pid);
      const keepOldX =
        prevWasBackwardsLayout(prev) &&
        old &&
        Number.isFinite(old.x) &&
        (railX >= ext.maxOut
          ? old.x >= ext.maxOut - 1
          : old.x <= ext.minIn + 1);
      const junction: RoutingJunction = {
        id: jid,
        x: keepOldX ? old!.x : railX,
        y: snapToGrid(pos.y),
      };
      graph.junctions[jid] = junction;
      bucket.push(junction);
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
  };

  placeRail(outPorts, outRailX, outJunctions);
  placeRail(inPorts, inRailX, inJunctions);

  const wrapOutId = "j-wrap-out";
  const wrapInId = "j-wrap-in";
  const prevWrapOut = prev?.junctions[wrapOutId];
  const prevWrapIn = prev?.junctions[wrapInId];
  const wrapOut: RoutingJunction = {
    id: wrapOutId,
    x: prevWrapOut?.x ?? outRailX,
    y: wrapY,
  };
  const wrapIn: RoutingJunction = {
    id: wrapInId,
    x: prevWrapIn?.x ?? inRailX,
    y: wrapY,
  };
  graph.junctions[wrapOutId] = wrapOut;
  graph.junctions[wrapInId] = wrapIn;

  const outChain = linkVerticalChain(
    graph,
    itemId,
    [...outJunctions, wrapOut],
    cornersPrev,
  );
  const inChain = linkVerticalChain(
    graph,
    itemId,
    [...inJunctions, wrapIn],
    cornersPrev,
  );
  ensureSegment(
    graph,
    itemId,
    { kind: "junction", junctionId: wrapOutId },
    { kind: "junction", junctionId: wrapInId },
    cornersPrev,
  );
  const wrapSeg = segmentIdFor(
    { kind: "junction", junctionId: wrapOutId },
    { kind: "junction", junctionId: wrapInId },
  );

  const stubId = (pid: string): string | null => {
    const jid = portJunction.get(pid);
    if (!jid) return null;
    const kind = portKind(nodes, pid);
    const portEp: RoutingEndpoint = { kind: "port", portId: pid };
    const jEp: RoutingEndpoint = { kind: "junction", junctionId: jid };
    return kind === "out" ? segmentIdFor(portEp, jEp) : segmentIdFor(jEp, portEp);
  };

  for (const e of netEdges) {
    const jSrc = portJunction.get(e.source);
    const jTgt = portJunction.get(e.target);
    const sStub = stubId(e.source);
    const tStub = stubId(e.target);
    if (!jSrc || !jTgt || !sStub || !tStub) continue;
    const path = [
      sStub,
      ...busSegmentsAlongChain(graph, outChain, jSrc, wrapOutId),
      wrapSeg,
      ...busSegmentsAlongChain(graph, inChain, wrapInId, jTgt),
      tStub,
    ];
    routePaths.set(e.id, path);
  }

  return routePaths;
}

function buildForwardNetworkBus(
  graph: RoutingGraph,
  nodes: Node[],
  netEdges: Edge[],
  netId: string,
  cornersPrev: Map<string, OrthoPoint[]>,
  prev: RoutingGraph | undefined,
  ext: PortExtents,
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
  const corridorLeft = ext.hasOut ? ext.maxOut + BUS_INSET : -Infinity;
  const corridorRight = ext.hasIn ? ext.minIn - BUS_INSET : Infinity;
  const hasCorridor =
    ext.hasOut &&
    ext.hasIn &&
    corridorRight - corridorLeft >= FORWARD_MIN_GAP;

  const portJunction = new Map<string, string>();
  // Stable per-port junctions — adding a new I/O must not rewrite existing
  // stub segment ids (Y-group merges used to mint j-a_b and drop corners).
  for (const pid of ports) {
    const pos = portAbsPos(nodes, pid);
    if (!pos) continue;
    const jid = `j-${pid}`;
    const old = findPrevJunctionForPort(prev, pid);
    let x = busX;
    if (old && Number.isFinite(old.x)) {
      x = hasCorridor
        ? Math.max(corridorLeft, Math.min(corridorRight, old.x))
        : old.x;
    }
    const junction: RoutingJunction = {
      id: jid,
      x: snapToGrid(x),
      y: snapToGrid(pos.y),
    };
    graph.junctions[jid] = junction;
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

  const sorted = [...portJunction.values()]
    .map((jid) => graph.junctions[jid]!)
    .filter(Boolean)
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));

  const sortedIds = linkVerticalChain(graph, itemId, sorted, cornersPrev);

  const stubId = (pid: string): string | null => {
    const jid = portJunction.get(pid);
    if (!jid) return null;
    const kind = portKind(nodes, pid);
    const portEp: RoutingEndpoint = { kind: "port", portId: pid };
    const jEp: RoutingEndpoint = { kind: "junction", junctionId: jid };
    return kind === "out" ? segmentIdFor(portEp, jEp) : segmentIdFor(jEp, portEp);
  };

  for (const e of netEdges) {
    const jSrc = portJunction.get(e.source);
    const jTgt = portJunction.get(e.target);
    const sStub = stubId(e.source);
    const tStub = stubId(e.target);
    if (!jSrc || !jTgt || !sStub || !tStub) continue;
    const path = [
      sStub,
      ...busSegmentsAlongChain(graph, sortedIds, jSrc, jTgt),
      tStub,
    ];
    routePaths.set(e.id, path);
    void netId;
  }

  return routePaths;
}

function buildNetworkBus(
  graph: RoutingGraph,
  nodes: Node[],
  netEdges: Edge[],
  netId: string,
  cornersPrev: Map<string, OrthoPoint[]>,
  prev: RoutingGraph | undefined,
): Map<string, string[]> {
  const portIds = new Set<string>();
  for (const e of netEdges) {
    portIds.add(e.source);
    portIds.add(e.target);
  }
  const ext = portExtents(nodes, [...portIds]);
  const backwards = isBackwardsNetwork(ext);
  // Layout flip (forward ↔ wrap): drop migrated corners — absolute kinks from
  // the other mode punch through machines / invent stubs.
  const corners =
    prev && prevWasBackwardsLayout(prev) !== backwards
      ? new Map<string, OrthoPoint[]>()
      : cornersPrev;
  if (backwards) {
    return buildBackwardsNetworkBus(
      graph,
      nodes,
      netEdges,
      corners,
      prev,
      ext,
    );
  }
  return buildForwardNetworkBus(
    graph,
    nodes,
    netEdges,
    netId,
    corners,
    prev,
    ext,
  );
}

export type RoutingRebuildResult = {
  graph: RoutingGraph;
  edges: Edge[];
};

/**
 * True when a live node move crossed the forward/backwards corridor so shared
 * routing must rebuild (wrap rails vs single bus).
 */
export function routingLayoutNeedsRebuild(
  nodes: Node[],
  edges: Edge[],
  graph: RoutingGraph,
): boolean {
  if (Object.keys(graph.segments).length === 0) return false;
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
  for (const netEdges of byNet.values()) {
    if (netEdges.length < 2) continue;
    const portIds = new Set<string>();
    for (const e of netEdges) {
      portIds.add(e.source);
      portIds.add(e.target);
    }
    const ext = portExtents(nodes, [...portIds]);
    const wantBackwards = isBackwardsNetwork(ext);
    const hasWrap = Object.keys(graph.junctions).some((id) =>
      id.startsWith("j-wrap-"),
    );
    if (wantBackwards !== hasWrap) return true;
  }
  return false;
}

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
  const cornersPrev = buildCornersPrev(prev, nodes);
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
  let a = resolveEndpointPos(segment.a, nodes, graph);
  let b = resolveEndpointPos(segment.b, nodes, graph);
  if (!a || !b) return null;

  // Port↔junction stubs should stay axis-aligned with the port. Tiny Y drift
  // between junction sync and port row math was skipping X-clamp and putting
  // mid-handles / excroissances off the visible belt.
  const portEp =
    segment.a.kind === "port"
      ? segment.a
      : segment.b.kind === "port"
        ? segment.b
        : null;
  if (portEp) {
    const portPos = portAbsPos(nodes, portEp.portId);
    if (portPos) {
      if (Math.abs(a.y - b.y) <= 8 && Math.abs(a.x - b.x) > 8) {
        a = { x: a.x, y: portPos.y };
        b = { x: b.x, y: portPos.y };
      } else if (Math.abs(a.x - b.x) <= 8 && Math.abs(a.y - b.y) > 8) {
        a = { x: portPos.x, y: a.y };
        b = { x: portPos.x, y: b.y };
      }
    }
  }

  if (segment.cornersAbs && segment.cornersAbs.length >= 1) {
    return assembleOpenPolyline(
      { x: a.x, y: a.y },
      segment.cornersAbs,
      { x: b.x, y: b.y },
    );
  }

  // Legacy norms — only usable when the a→b box is non-degenerate on both axes
  if (segment.cornersNorm && segment.cornersNorm.length >= 2) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) >= 1e-6 && Math.abs(dy) >= 1e-6) {
      return resolveRoutePoints(
        a.x,
        a.y,
        b.x,
        b.y,
        { itemId: segment.itemId, cornersNorm: segment.cornersNorm },
        edgeIdForPreview,
      );
    }
  }

  // Axis-aligned stubs/bus runs stay as a single straight stroke by default.
  if (Math.abs(a.y - b.y) < 0.51 || Math.abs(a.x - b.x) < 0.51) {
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ];
  }
  return resolveRoutePoints(
    a.x,
    a.y,
    b.x,
    b.y,
    { itemId: segment.itemId },
    edgeIdForPreview,
  );
}

/** Move junction endpoints (e.g. after translating a shared bus segment). */
export function moveRoutingJunctions(
  graph: RoutingGraph,
  updates: Record<string, { x?: number; y?: number }>,
): RoutingGraph {
  let changed = false;
  const junctions = { ...graph.junctions };
  for (const [id, patch] of Object.entries(updates)) {
    const j = junctions[id];
    if (!j) continue;
    const x = patch.x !== undefined ? snapToGrid(patch.x) : j.x;
    const y = patch.y !== undefined ? snapToGrid(patch.y) : j.y;
    if (Math.abs(x - j.x) > 0.01 || Math.abs(y - j.y) > 0.01) {
      junctions[id] = { ...j, x, y };
      changed = true;
    }
  }
  return changed ? { ...graph, junctions } : graph;
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
  _anchor?: RouteAnchor,
): RoutingGraph {
  const seg = graph.segments[segmentId];
  if (!seg) return graph;
  const next = { ...seg };
  if (!corners || corners.length < 1) {
    delete next.cornersAbs;
    delete next.cornersNorm;
  } else {
    // Always store absolute corners — norms collapse on axis-aligned segments.
    next.cornersAbs = corners.map((p) => ({ x: p.x, y: p.y }));
    delete next.cornersNorm;
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
      cornersAbs: seg.cornersAbs,
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
      selectable: true,
      focusable: true,
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
