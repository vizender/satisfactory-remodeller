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
  MIN_PORT_STUB,
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

/** Input left of bus / output right of bus → needs a local around-machine stub. */
export function portWrongSideOfBus(
  kind: "in" | "out",
  portX: number,
  busX: number,
): boolean {
  return kind === "in" ? portX < busX - 0.5 : portX > busX + 0.5;
}

/**
 * Corners for a port↔junction stub that wraps around the machine to reach the
 * shared bus. Ordered along the segment direction (out: port→j, in: j→port).
 */
export function aroundMachineStubCorners(
  kind: "in" | "out",
  port: OrthoPoint,
  busX: number,
): OrthoPoint[] {
  const leaveX = snapToGrid(
    kind === "in" ? port.x - BACKWARDS_STUB : port.x + BACKWARDS_STUB,
  );
  const wrapY = snapToGrid(port.y + BACKWARDS_BUS_OFFSET);
  const bus = snapToGrid(busX);
  const py = snapToGrid(port.y);
  if (kind === "out") {
    return [
      { x: leaveX, y: py },
      { x: leaveX, y: wrapY },
      { x: bus, y: wrapY },
    ];
  }
  return [
    { x: bus, y: wrapY },
    { x: leaveX, y: wrapY },
    { x: leaveX, y: py },
  ];
}

function looksLikeAroundDetour(
  corners: OrthoPoint[],
  kind: "in" | "out",
  port: OrthoPoint,
  busX: number,
): boolean {
  if (corners.length !== 3) return false;
  const [c0, c1, c2] = corners;
  if (!c0 || !c1 || !c2) return false;
  if (kind === "out") {
    // port → leaveX → wrapY → bus (leave sits beyond the machine, away from bus)
    return (
      Math.abs(c0.x - c1.x) < 1.5 &&
      Math.abs(c1.y - c2.y) < 1.5 &&
      Math.abs(c2.x - busX) < 2 &&
      Math.abs(c0.y - port.y) < 8 &&
      c0.x > Math.max(port.x, busX) + 8
    );
  }
  // junction → bus,wrapY → leave,wrapY → leave,portY
  return (
    Math.abs(c1.x - c2.x) < 1.5 &&
    Math.abs(c0.y - c1.y) < 1.5 &&
    Math.abs(c0.x - busX) < 2 &&
    Math.abs(c2.y - port.y) < 8 &&
    c2.x < Math.min(port.x, busX) - 8
  );
}

function stubPortAndJunction(
  seg: RoutingSegment,
): { portId: string; junctionId: string } | null {
  if (seg.a.kind === "port" && seg.b.kind === "junction") {
    return { portId: seg.a.portId, junctionId: seg.b.junctionId };
  }
  if (seg.a.kind === "junction" && seg.b.kind === "port") {
    return { portId: seg.b.portId, junctionId: seg.a.junctionId };
  }
  return null;
}

/**
 * Keep the shared bus fixed; only update each port's stub. Wrong-side ports
 * get a local around-machine detour; correct-side ports drop auto-detours.
 */
export function applyLocalStubDetours(
  graph: RoutingGraph,
  nodes: Node[],
  onlyPortIds?: ReadonlySet<string>,
): RoutingGraph {
  let changed = false;
  const segments = { ...graph.segments };
  for (const seg of Object.values(graph.segments)) {
    const ends = stubPortAndJunction(seg);
    if (!ends) continue;
    if (onlyPortIds && !onlyPortIds.has(ends.portId)) continue;
    const kind = portKind(nodes, ends.portId);
    const portPos = portAbsPos(nodes, ends.portId);
    const j = graph.junctions[ends.junctionId];
    if (!kind || !portPos || !j) continue;
    const busX = j.x;
    const wrong = portWrongSideOfBus(kind, portPos.x, busX);
    if (wrong) {
      const nextCorners = aroundMachineStubCorners(kind, portPos, busX);
      const prev = seg.cornersAbs;
      const same =
        !!prev &&
        prev.length === nextCorners.length &&
        prev.every(
          (p, i) =>
            Math.abs(p.x - nextCorners[i]!.x) < 0.01 &&
            Math.abs(p.y - nextCorners[i]!.y) < 0.01,
        );
      if (!same) {
        const next: RoutingSegment = {
          ...seg,
          cornersAbs: nextCorners,
        };
        delete next.cornersNorm;
        segments[seg.id] = next;
        changed = true;
      }
    } else if (
      seg.cornersAbs &&
      looksLikeAroundDetour(seg.cornersAbs, kind, portPos, busX)
    ) {
      const next: RoutingSegment = { ...seg };
      delete next.cornersAbs;
      segments[seg.id] = next;
      changed = true;
    }
  }
  return changed ? { ...graph, segments } : graph;
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
  // Migrating off a legacy wrap layout: ignore mixed out/in rail Xs.
  const migrateOffWrap = prevWasBackwardsLayout(prev);
  const portJunction = new Map<string, string>();

  // Freeze prior shared bus X so one wrong-side port cannot pull the whole rail.
  let prevBusX: number | null = null;
  if (prev && !migrateOffWrap) {
    const xs: number[] = [];
    for (const pid of ports) {
      const old = findPrevJunctionForPort(prev, pid);
      if (old) xs.push(old.x);
    }
    for (const id of junctionIds) {
      const j = prev.junctions[id];
      if (j) xs.push(j.x);
    }
    if (xs.length > 0) {
      prevBusX = xs.reduce((a, b) => a + b, 0) / xs.length;
    }
  }

  // Only correct-side ports constrain the bus (wrong-side ports use local detours).
  let maxOutCorrect = -Infinity;
  let minInCorrect = Infinity;
  let hasOutCorrect = false;
  let hasInCorrect = false;
  for (const pid of ports) {
    const pos = portAbsPos(nodes, pid);
    const kind = portKind(nodes, pid);
    if (!pos || !kind) continue;
    if (prevBusX != null && portWrongSideOfBus(kind, pos.x, prevBusX)) continue;
    if (kind === "out") {
      hasOutCorrect = true;
      maxOutCorrect = Math.max(maxOutCorrect, pos.x);
    } else {
      hasInCorrect = true;
      minInCorrect = Math.min(minInCorrect, pos.x);
    }
  }

  let x =
    prevBusX ??
    pickBusX(
      nodes,
      ports,
      migrateOffWrap ? undefined : prev,
      junctionIds,
    );
  if (hasOutCorrect) x = Math.max(x, maxOutCorrect + MIN_PORT_STUB);
  if (hasInCorrect) x = Math.min(x, minInCorrect - MIN_PORT_STUB);
  if (
    hasOutCorrect &&
    hasInCorrect &&
    maxOutCorrect + MIN_PORT_STUB > minInCorrect - MIN_PORT_STUB
  ) {
    // Prefer freezing the prior bus over collapsing toward wrong-side ports.
    x = prevBusX ?? (maxOutCorrect + minInCorrect) / 2;
  }
  if (
    prevBusX != null &&
    !hasOutCorrect &&
    !hasInCorrect
  ) {
    x = prevBusX;
  }
  // Fresh build with no prior bus: fall back to full extents (incl. wrong-side).
  if (prevBusX == null && !hasOutCorrect && !hasInCorrect) {
    if (ext.hasOut) x = Math.max(x, ext.maxOut + MIN_PORT_STUB);
    if (ext.hasIn) x = Math.min(x, ext.minIn - MIN_PORT_STUB);
    if (
      ext.hasOut &&
      ext.hasIn &&
      ext.maxOut + MIN_PORT_STUB > ext.minIn - MIN_PORT_STUB
    ) {
      x = (ext.maxOut + ext.minIn) / 2;
    }
  }
  x = snapToGrid(x);

  for (const pid of ports) {
    const pos = portAbsPos(nodes, pid);
    if (!pos) continue;
    const jid = `j-${pid}`;
    const junction: RoutingJunction = {
      id: jid,
      x,
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
  // Drop absolute kinks when migrating off a legacy whole-network wrap layout.
  const corners = prevWasBackwardsLayout(prev)
    ? new Map<string, OrthoPoint[]>()
    : cornersPrev;
  const paths = buildForwardNetworkBus(
    graph,
    nodes,
    netEdges,
    netId,
    corners,
    prev,
    ext,
  );
  // Local around-machine detours for wrong-side ports — never rebuild the rail.
  const detoured = applyLocalStubDetours(graph, nodes);
  if (detoured !== graph) {
    graph.segments = detoured.segments;
  }
  return paths;
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
    if (!j.id.startsWith("j-") || j.id.startsWith("j-wrap-")) continue;
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
  const withY = changed ? { ...graph, junctions } : graph;
  // Local stub follow / around-machine detours — never translate the shared bus.
  return applyLocalStubDetours(withY, nodes);
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

  // Port↔junction stubs should stay axis-aligned with the port — but NEVER
  // collapse onto the port X (that removes the min horizontal clearance).
  const portEp =
    segment.a.kind === "port"
      ? segment.a
      : segment.b.kind === "port"
        ? segment.b
        : null;
  if (portEp) {
    const portPos = portAbsPos(nodes, portEp.portId);
    const kind = portKind(nodes, portEp.portId);
    if (portPos && kind) {
      if (Math.abs(a.y - b.y) <= 8) {
        a = { x: a.x, y: portPos.y };
        b = { x: b.x, y: portPos.y };
      }
      // Skip min-stub push when a local around-machine detour owns the path —
      // wrong-side ports sit on the opposite side of the bus from a straight stub.
      const hasDetour = (segment.cornersAbs?.length ?? 0) >= 1;
      if (!hasDetour) {
        const jIsA = segment.a.kind === "junction";
        const jPt = jIsA ? a : b;
        const pPt = jIsA ? b : a;
        if (Math.abs(jPt.x - pPt.x) < MIN_PORT_STUB) {
          const pushedX =
            kind === "out"
              ? portPos.x + MIN_PORT_STUB
              : portPos.x - MIN_PORT_STUB;
          if (jIsA) a = { x: pushedX, y: a.y };
          else b = { x: pushedX, y: b.y };
        }
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

/**
 * Translate a junction↔junction rail/wrap: move every colinear connected
 * junction together and clear leftover U-bend cornersAbs on those bus runs.
 */
export function translateRailJunctions(
  graph: RoutingGraph,
  segmentId: string,
  axis: "x" | "y",
  newValue: number,
): RoutingGraph {
  const seg = graph.segments[segmentId];
  if (!seg || seg.a.kind !== "junction" || seg.b.kind !== "junction") {
    return graph;
  }
  const seedA = graph.junctions[seg.a.junctionId];
  const seedB = graph.junctions[seg.b.junctionId];
  if (!seedA || !seedB) return graph;
  const oldValue = axis === "x" ? seedA.x : seedA.y;

  const ids = new Set<string>();
  const queue = [seg.a.junctionId, seg.b.junctionId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (ids.has(id)) continue;
    const j = graph.junctions[id];
    if (!j) continue;
    if (Math.abs((axis === "x" ? j.x : j.y) - oldValue) > 0.51) continue;
    ids.add(id);
    for (const s of Object.values(graph.segments)) {
      if (s.a.kind !== "junction" || s.b.kind !== "junction") continue;
      if (s.a.junctionId === id) queue.push(s.b.junctionId);
      if (s.b.junctionId === id) queue.push(s.a.junctionId);
    }
  }

  const updates: Record<string, { x?: number; y?: number }> = {};
  const snapped = snapToGrid(newValue);
  for (const id of ids) {
    updates[id] = axis === "x" ? { x: snapped } : { y: snapped };
  }
  let next = moveRoutingJunctions(graph, updates);
  // Drop U-bend corners stored on rail segments — endpoints moved with the rail.
  for (const s of Object.values(next.segments)) {
    if (!s.cornersAbs?.length) continue;
    if (s.a.kind !== "junction" || s.b.kind !== "junction") continue;
    if (
      !ids.has(s.a.junctionId) &&
      !ids.has(s.b.junctionId)
    ) {
      continue;
    }
    next = setSegmentCornersNorm(next, s.id, undefined);
  }
  return next;
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
