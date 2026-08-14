import type { Edge, Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import { snapToGrid } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  assembleOpenPolyline,
  BACKWARDS_BUS_OFFSET,
  BACKWARDS_STUB,
  buildEdgeNetworkIds,
  clampXOutsidePortFrame,
  enforcePortStubElbow,
  FORWARD_MIN_GAP,
  interiorCorners,
  MIN_PORT_STUB,
  resolveRoutePoints,
  simplifyOrthoPoints,
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

const { PORT_ROW, PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;
const BUS_INSET = 40;
/** Clearance past the machine frame for leave / wrap detours. */
const DETOUR_MARGIN = 16;
/** Min |ΔY| between a wrap rail and another port's horizontal. */
const WRAP_CLEAR_PORT = 20;

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

export type FrameBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function cssSize(
  value: string | number | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Absolute AABB of the machine/container frame that owns a port. */
export function frameBoundsForPort(
  nodes: Node[],
  portId: string,
): FrameBounds | null {
  const port = nodes.find((n) => n.id === portId && n.type === "itemPort");
  if (!port?.parentId) return null;
  const frame = nodes.find((n) => n.id === port.parentId);
  if (!frame) return null;
  const defaultW = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;
  const w = cssSize(
    frame.style?.width as string | number | undefined,
    defaultW,
  );
  const h = cssSize(frame.style?.height as string | number | undefined, 196);
  return {
    left: frame.position.x,
    right: frame.position.x + w,
    top: frame.position.y,
    bottom: frame.position.y + h,
  };
}

/**
 * Every machine AABB a routing segment can collide with: its own port's
 * frame plus any port stub sharing a junction (so a bus V between the
 * output and the top input is clamped against BOTH machines).
 */
export function framesForRoutingSegment(
  nodes: Node[],
  graph: RoutingGraph,
  segment: RoutingSegment,
): FrameBounds[] {
  const portIds = new Set<string>();
  if (segment.a.kind === "port") portIds.add(segment.a.portId);
  if (segment.b.kind === "port") portIds.add(segment.b.portId);
  const jids = new Set<string>();
  if (segment.a.kind === "junction") jids.add(segment.a.junctionId);
  if (segment.b.kind === "junction") jids.add(segment.b.junctionId);
  // Colocated T-junctions (output aligned with the top input) share a point
  // with no jj edge — still collide with that port's machine.
  if (jids.size > 0) {
    for (const id of [...jids]) {
      const seed = graph.junctions[id];
      if (!seed) continue;
      for (const [oid, j] of Object.entries(graph.junctions)) {
        if (jids.has(oid)) continue;
        if (Math.abs(j.x - seed.x) > 0.51) continue;
        if (Math.abs(j.y - seed.y) > 0.51) continue;
        jids.add(oid);
      }
    }
  }
  if (jids.size > 0) {
    for (const s of Object.values(graph.segments)) {
      const pid =
        s.a.kind === "port" && s.b.kind === "junction" && jids.has(s.b.junctionId)
          ? s.a.portId
          : s.b.kind === "port" &&
              s.a.kind === "junction" &&
              jids.has(s.a.junctionId)
            ? s.b.portId
            : null;
      if (pid) portIds.add(pid);
    }
  }
  const frames: FrameBounds[] = [];
  const seen = new Set<string>();
  for (const pid of portIds) {
    const f = frameBoundsForPort(nodes, pid);
    if (!f) continue;
    const key = `${f.left}:${f.top}:${f.right}:${f.bottom}`;
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push(f);
  }
  return frames;
}

function wrapYCollides(
  wrapY: number,
  frame: FrameBounds | null,
  avoidYs: number[],
): boolean {
  if (frame) {
    if (
      wrapY > frame.top - DETOUR_MARGIN + 0.5 &&
      wrapY < frame.bottom + DETOUR_MARGIN - 0.5
    ) {
      return true;
    }
  }
  for (const y of avoidYs) {
    if (Math.abs(wrapY - y) < WRAP_CLEAR_PORT) return true;
  }
  return false;
}

function pickDetourWrapY(
  portY: number,
  frame: FrameBounds | null,
  preferWrapY: number | null | undefined,
  avoidYs: number[],
): number {
  const below = frame
    ? snapToGrid(frame.bottom + DETOUR_MARGIN)
    : snapToGrid(portY + BACKWARDS_BUS_OFFSET);
  const above = frame
    ? snapToGrid(frame.top - DETOUR_MARGIN)
    : snapToGrid(portY - BACKWARDS_BUS_OFFSET);

  if (
    preferWrapY != null &&
    Number.isFinite(preferWrapY) &&
    !wrapYCollides(preferWrapY, frame, avoidYs)
  ) {
    return snapToGrid(preferWrapY);
  }

  // Prefer side the user was already on when nudging after a collision.
  if (preferWrapY != null && Number.isFinite(preferWrapY) && frame) {
    const preferBelow = preferWrapY >= (frame.top + frame.bottom) / 2;
    const primary = preferBelow ? below : above;
    const secondary = preferBelow ? above : below;
    if (!wrapYCollides(primary, frame, avoidYs)) return primary;
    if (!wrapYCollides(secondary, frame, avoidYs)) return secondary;
    // Nudge further away from the frame on the preferred side.
    let y = primary;
    for (let i = 0; i < 8; i++) {
      y = snapToGrid(
        preferBelow ? y + WRAP_CLEAR_PORT : y - WRAP_CLEAR_PORT,
      );
      if (!wrapYCollides(y, frame, avoidYs)) return y;
    }
  }

  if (!wrapYCollides(below, frame, avoidYs)) return below;
  if (!wrapYCollides(above, frame, avoidYs)) return above;
  return below;
}

function detourLeaveX(
  kind: "in" | "out",
  portX: number,
  frame: FrameBounds | null,
): number {
  if (kind === "in") {
    const outside = frame ? frame.left - DETOUR_MARGIN : portX - BACKWARDS_STUB;
    return snapToGrid(Math.min(portX - BACKWARDS_STUB, outside));
  }
  const outside = frame ? frame.right + DETOUR_MARGIN : portX + BACKWARDS_STUB;
  return snapToGrid(Math.max(portX + BACKWARDS_STUB, outside));
}

/**
 * Corners for a port↔junction stub that wraps around the machine to reach the
 * shared bus. The port's bus junction sits at wrapY (not port Y) so the return
 * horizontal merges cleanly into the bus with no spur stub.
 *
 * out: port → leave → wrap → j(bus, wrapY)
 * in:  j(bus, wrapY) → leave@wrap → leave@port → port
 */
export function aroundMachineStubCorners(
  kind: "in" | "out",
  port: OrthoPoint,
  busX: number,
  opts?: {
    frame?: FrameBounds | null;
    preferWrapY?: number | null;
    avoidYs?: number[];
  },
): OrthoPoint[] {
  const frame = opts?.frame ?? null;
  const avoidYs = (opts?.avoidYs ?? []).filter((y) => Math.abs(y - port.y) > 1);
  const leaveX = detourLeaveX(kind, port.x, frame);
  const wrapY = pickDetourWrapY(
    port.y,
    frame,
    opts?.preferWrapY,
    avoidYs,
  );
  const py = snapToGrid(port.y);
  void busX;
  if (kind === "out") {
    return [
      { x: leaveX, y: py },
      { x: leaveX, y: wrapY },
    ];
  }
  return [
    { x: leaveX, y: wrapY },
    { x: leaveX, y: py },
  ];
}

function extractDetourWrapY(
  corners: OrthoPoint[] | undefined,
  kind: "in" | "out",
): number | null {
  if (!corners || corners.length < 2) return null;
  // Wrap Y is the leave-column end away from the port.
  if (kind === "out") {
    return corners[corners.length - 1]?.y ?? null;
  }
  return corners[0]?.y ?? null;
}

/** Loose U-shape check (survives port-Y drift while dragging the machine). */
function isUDetourShape(
  corners: OrthoPoint[],
  kind: "in" | "out",
  _busX: number,
): boolean {
  if (corners.length === 2) {
    const [c0, c1] = corners;
    if (!c0 || !c1) return false;
    return Math.abs(c0.x - c1.x) < 1.5; // leave column
  }
  if (corners.length !== 3) return false;
  // Legacy 3-corner detours (junction stayed at port Y)
  const [c0, c1, c2] = corners;
  if (!c0 || !c1 || !c2) return false;
  if (kind === "out") {
    return Math.abs(c0.x - c1.x) < 1.5 && Math.abs(c1.y - c2.y) < 1.5;
  }
  return Math.abs(c1.x - c2.x) < 1.5 && Math.abs(c0.y - c1.y) < 1.5;
}

function looksLikeAroundDetour(
  corners: OrthoPoint[],
  kind: "in" | "out",
  port: OrthoPoint,
  busX: number,
): boolean {
  if (corners.length === 2) {
    const [c0, c1] = corners;
    if (!c0 || !c1) return false;
    if (Math.abs(c0.x - c1.x) >= 1.5) return false;
    if (kind === "out") {
      return (
        Math.abs(c0.y - port.y) < 8 &&
        c0.x > Math.max(port.x, busX) + 8
      );
    }
    return (
      Math.abs(c1.y - port.y) < 8 &&
      c0.x < Math.min(port.x, busX) - 8
    );
  }
  if (corners.length !== 3) return false;
  const [c0, c1, c2] = corners;
  if (!c0 || !c1 || !c2) return false;
  if (kind === "out") {
    return (
      Math.abs(c0.x - c1.x) < 1.5 &&
      Math.abs(c1.y - c2.y) < 1.5 &&
      Math.abs(c2.x - busX) < 2 &&
      Math.abs(c0.y - port.y) < 8 &&
      c0.x > Math.max(port.x, busX) + 8
    );
  }
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

/** Y of other ports that share this port's parent machine (avoid merging lines). */
function siblingPortYs(nodes: Node[], portId: string): number[] {
  const port = nodes.find((n) => n.id === portId && n.type === "itemPort");
  if (!port?.parentId) return [];
  const ys: number[] = [];
  for (const n of nodes) {
    if (n.type !== "itemPort" || n.parentId !== port.parentId || n.id === portId) {
      continue;
    }
    const pos = portAbsPos(nodes, n.id);
    if (pos) ys.push(pos.y);
  }
  return ys;
}

/**
 * Keep the shared bus fixed; only update each port's stub. Wrong-side ports
 * get a local around-machine detour; correct-side ports drop auto-detours.
 * User-chosen wrap Y is preserved unless it collides with the machine or
 * sibling port horizontals. The port junction sits on wrapY so the return H
 * merges into the bus without a spur stub.
 */
export function applyLocalStubDetours(
  graph: RoutingGraph,
  nodes: Node[],
  onlyPortIds?: ReadonlySet<string>,
): RoutingGraph {
  let changed = false;
  const segments = { ...graph.segments };
  let junctions = graph.junctions;
  let junctionsCopied = false;
  const setJunctionY = (id: string, y: number) => {
    const cur = junctions[id];
    if (!cur || Math.abs(cur.y - y) < 0.01) return;
    if (!junctionsCopied) {
      junctions = { ...graph.junctions };
      junctionsCopied = true;
    }
    junctions[id] = { ...cur, y: snapToGrid(y) };
    changed = true;
  };

  for (const seg of Object.values(graph.segments)) {
    const ends = stubPortAndJunction(seg);
    if (!ends) continue;
    if (onlyPortIds && !onlyPortIds.has(ends.portId)) continue;
    const kind = portKind(nodes, ends.portId);
    const portPos = portAbsPos(nodes, ends.portId);
    const j = junctions[ends.junctionId] ?? graph.junctions[ends.junctionId];
    if (!kind || !portPos || !j) continue;
    const busX = j.x;
    const wrong = portWrongSideOfBus(kind, portPos.x, busX);
    if (wrong) {
      const prevWrap =
        seg.cornersAbs &&
        isUDetourShape(seg.cornersAbs, kind, busX)
          ? extractDetourWrapY(seg.cornersAbs, kind)
          : null;
      const nextCorners = aroundMachineStubCorners(kind, portPos, busX, {
        frame: frameBoundsForPort(nodes, ends.portId),
        preferWrapY: prevWrap,
        avoidYs: siblingPortYs(nodes, ends.portId),
      });
      const wrapY = extractDetourWrapY(nextCorners, kind);
      if (wrapY != null) setJunctionY(ends.junctionId, wrapY);
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
    } else {
      setJunctionY(ends.junctionId, portPos.y);
      if (
        seg.cornersAbs &&
        looksLikeAroundDetour(seg.cornersAbs, kind, portPos, busX)
      ) {
        const next: RoutingSegment = { ...seg };
        delete next.cornersAbs;
        segments[seg.id] = next;
        changed = true;
      } else if (seg.cornersAbs && seg.cornersAbs.length >= 1) {
        // User kinks on the correct-side stub: eject anything inside the body.
        const frame = frameBoundsForPort(nodes, ends.portId);
        if (frame) {
          const pin = kind === "out" ? "start" : "end";
          const a = kind === "out" ? portPos : { x: j.x, y: portPos.y };
          const b = kind === "out" ? { x: j.x, y: portPos.y } : portPos;
          const raw = assembleOpenPolyline(a, seg.cornersAbs, b);
          const fixed = enforcePortStubElbow(raw, pin, frame);
          const nextCorners = interiorCorners(fixed);
          const same =
            nextCorners.length === seg.cornersAbs.length &&
            nextCorners.every(
              (p, i) =>
                Math.abs(p.x - seg.cornersAbs![i]!.x) < 0.01 &&
                Math.abs(p.y - seg.cornersAbs![i]!.y) < 0.01,
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
        }
      }
    }
  }
  if (!changed) return graph;
  return junctionsCopied
    ? { ...graph, segments, junctions }
    : { ...graph, segments };
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
    graph.junctions = detoured.junctions;
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
  return sanitizeRoutingCornersOutsideFrames(
    applyLocalStubDetours(withY, nodes),
    nodes,
  );
}

/** Eject stored kinks that sit inside a connected machine (bus U-bend H/V). */
function sanitizeRoutingCornersOutsideFrames(
  graph: RoutingGraph,
  nodes: Node[],
): RoutingGraph {
  let segments = graph.segments;
  let copied = false;
  for (const seg of Object.values(graph.segments)) {
    if (!seg.cornersAbs || seg.cornersAbs.length < 1) continue;
    const frames = framesForRoutingSegment(nodes, graph, seg);
    if (frames.length === 0) continue;
    const a = resolveEndpointPos(seg.a, nodes, graph);
    const b = resolveEndpointPos(seg.b, nodes, graph);
    if (!a || !b) continue;
    const pin =
      seg.a.kind === "port"
        ? ("start" as const)
        : seg.b.kind === "port"
          ? ("end" as const)
          : ("both" as const);
    const raw = assembleOpenPolyline(a, seg.cornersAbs, b);
    const fixed = enforcePortStubElbow(raw, pin, frames);
    const nextCorners = interiorCorners(fixed);
    const same =
      nextCorners.length === seg.cornersAbs.length &&
      nextCorners.every(
        (p, i) =>
          Math.abs(p.x - seg.cornersAbs![i]!.x) < 0.01 &&
          Math.abs(p.y - seg.cornersAbs![i]!.y) < 0.01,
      );
    if (same) continue;
    if (!copied) {
      segments = { ...graph.segments };
      copied = true;
    }
    const next: RoutingSegment = { ...seg, cornersAbs: nextCorners };
    delete next.cornersNorm;
    if (nextCorners.length < 1) delete next.cornersAbs;
    segments[seg.id] = next;
  }
  return copied ? { ...graph, segments } : graph;
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
      const jx = segment.a.kind === "junction" ? a.x : b.x;
      const hasDetour =
        !!segment.cornersAbs &&
        portWrongSideOfBus(kind, portPos.x, jx) &&
        looksLikeAroundDetour(segment.cornersAbs, kind, portPos, jx);
      if (hasDetour && segment.cornersAbs) {
        // Junction sits on the wrap rail; port stays at port Y.
        const wrapY =
          kind === "out"
            ? segment.cornersAbs[segment.cornersAbs.length - 1]!.y
            : segment.cornersAbs[0]!.y;
        const jIsA = segment.a.kind === "junction";
        if (jIsA) {
          a = { x: a.x, y: wrapY };
          b = { x: b.x, y: portPos.y };
        } else {
          a = { x: a.x, y: portPos.y };
          b = { x: b.x, y: wrapY };
        }
      } else if (Math.abs(a.y - b.y) <= 8) {
        a = { x: a.x, y: portPos.y };
        b = { x: b.x, y: portPos.y };
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
 * Live previews for segments that touch a junction whose Y is moving (e.g. wrap
 * rail drag). Keeps the shared bus V attached to the wrap H during pointer move.
 * Also covers colocated merge junctions (same x/y, no jj segment between them).
 */
export function previewSegmentsForJunctionY(
  graph: RoutingGraph,
  nodes: Node[],
  junctionId: string,
  newY: number,
  excludeSegmentId: string,
): Map<string, OrthoPoint[]> {
  const seed = graph.junctions[junctionId];
  if (!seed) return new Map();
  const y = snapToGrid(newY);
  const movedIds = new Set<string>([junctionId]);
  // Colocated bus merges share a point without a jj edge — move them together.
  for (const [id, j] of Object.entries(graph.junctions)) {
    if (id === junctionId) continue;
    if (Math.abs(j.x - seed.x) > 0.51) continue;
    if (Math.abs(j.y - seed.y) > 0.51) continue;
    movedIds.add(id);
  }

  const out = new Map<string, OrthoPoint[]>();
  for (const seg of Object.values(graph.segments)) {
    if (seg.id === excludeSegmentId) continue;
    const atA =
      seg.a.kind === "junction" && movedIds.has(seg.a.junctionId);
    const atB =
      seg.b.kind === "junction" && movedIds.has(seg.b.junctionId);
    if (!atA && !atB) continue;
    const pts = resolveSegmentPoints(seg, nodes, graph, seg.id);
    if (!pts || pts.length < 2) continue;
    const next = pts.map((p) => ({ ...p }));
    if (atA) {
      next[0] = { x: next[0]!.x, y };
      if (next[1] && Math.abs(next[0]!.x - next[1].x) > 1.5) {
        next[1] = { x: next[1].x, y };
      }
    }
    if (atB) {
      const last = next.length - 1;
      next[last] = { x: next[last]!.x, y };
      const prev = last - 1;
      if (prev >= 0 && Math.abs(next[last]!.x - next[prev]!.x) > 1.5) {
        next[prev] = { x: next[prev]!.x, y };
      }
    }
    out.set(seg.id, simplifyOrthoPoints(next));
  }
  return out;
}

/**
 * Live previews when a vertical bus column slides in X. Stubs stay attached
 * at the T (no U-bend H spur). Vertices that sat on the old column follow.
 */
export function previewSegmentsForJunctionX(
  graph: RoutingGraph,
  nodes: Node[],
  columnX: number,
  newX: number,
  excludeSegmentId: string,
): Map<string, OrthoPoint[]> {
  const x = snapToGrid(newX);
  const movedIds = new Set<string>();
  for (const [id, j] of Object.entries(graph.junctions)) {
    if (Math.abs(j.x - columnX) <= 0.51) movedIds.add(id);
  }
  const out = new Map<string, OrthoPoint[]>();
  for (const seg of Object.values(graph.segments)) {
    if (seg.id === excludeSegmentId) continue;
    const atA =
      seg.a.kind === "junction" && movedIds.has(seg.a.junctionId);
    const atB =
      seg.b.kind === "junction" && movedIds.has(seg.b.junctionId);
    if (!atA && !atB) continue;
    const pts = resolveSegmentPoints(seg, nodes, graph, seg.id);
    if (!pts || pts.length < 2) continue;
    const next = pts.map((p) =>
      Math.abs(p.x - columnX) < 1.5 ? { x, y: p.y } : { ...p },
    );
    out.set(seg.id, simplifyOrthoPoints(next));
  }
  return out;
}

/** Port stubs attached to these junctions (min-stub clamp). */
export function portLimitsForJunctionIds(
  nodes: Node[],
  graph: RoutingGraph,
  jids: ReadonlySet<string>,
): { x: number; kind: "in" | "out" }[] {
  const out: { x: number; kind: "in" | "out" }[] = [];
  for (const s of Object.values(graph.segments)) {
    const pid =
      s.a.kind === "port" && s.b.kind === "junction" && jids.has(s.b.junctionId)
        ? s.a.portId
        : s.b.kind === "port" &&
            s.a.kind === "junction" &&
            jids.has(s.a.junctionId)
          ? s.b.portId
          : null;
    if (!pid) continue;
    const kind = portKind(nodes, pid);
    const pos = portAbsPos(nodes, pid);
    if (!kind || !pos) continue;
    out.push({ x: pos.x, kind });
  }
  return out;
}

/** Port attachments on a bus column (for min-stub clamp while sliding the rail). */
export function busColumnPortLimits(
  nodes: Node[],
  graph: RoutingGraph,
  segment: RoutingSegment,
): { x: number; kind: "in" | "out" }[] {
  const jids = new Set<string>();
  if (segment.a.kind === "junction") jids.add(segment.a.junctionId);
  if (segment.b.kind === "junction") jids.add(segment.b.junctionId);
  if (jids.size === 0) return [];
  const seeds = [...jids];
  for (const id of seeds) {
    const seed = graph.junctions[id];
    if (!seed) continue;
    for (const [oid, j] of Object.entries(graph.junctions)) {
      if (Math.abs(j.x - seed.x) > 0.51) continue;
      jids.add(oid);
    }
  }
  return portLimitsForJunctionIds(nodes, graph, jids);
}

export function clampBusColumnX(
  proposedX: number,
  y1: number,
  y2: number,
  frames: FrameBounds[],
  portLimits: { x: number; kind: "in" | "out" }[],
): number {
  let x = clampXOutsidePortFrame(proposedX, y1, y2, frames, "nearest");
  let minX = -Infinity;
  let maxX = Infinity;
  for (const p of portLimits) {
    if (p.kind === "out") minX = Math.max(minX, p.x + MIN_PORT_STUB);
    else maxX = Math.min(maxX, p.x - MIN_PORT_STUB);
  }
  if (minX <= maxX) x = Math.max(minX, Math.min(maxX, x));
  return snapToGrid(x);
}

/**
 * Junction↔junction verticals that share this segment's bus column X.
 */
export function junctionColumnVerticalIds(
  graph: RoutingGraph,
  segmentId: string,
): string[] {
  const seg = graph.segments[segmentId];
  if (!seg || seg.a.kind !== "junction" || seg.b.kind !== "junction") {
    return [];
  }
  const ja = graph.junctions[seg.a.junctionId];
  const jb = graph.junctions[seg.b.junctionId];
  if (!ja || !jb) return [];
  const colX = ja.x;
  if (Math.abs(jb.x - colX) > 0.51) return [];
  const ids: string[] = [];
  for (const s of Object.values(graph.segments)) {
    if (s.a.kind !== "junction" || s.b.kind !== "junction") continue;
    const a = graph.junctions[s.a.junctionId];
    const b = graph.junctions[s.b.junctionId];
    if (!a || !b) continue;
    if (Math.abs(a.x - colX) > 0.51 || Math.abs(b.x - colX) > 0.51) continue;
    if (Math.abs(a.y - b.y) < 0.51) continue;
    ids.push(s.id);
  }
  return ids;
}

/**
 * Slide the whole bus column only when every vertical span on that column is
 * already in the selection (shift-click each). A single span slides its own
 * endpoints so attached H stubs stretch.
 */
export function shouldTranslateBusColumn(
  graph: RoutingGraph,
  segmentId: string,
  selectedIds: ReadonlySet<string>,
): boolean {
  const col = junctionColumnVerticalIds(graph, segmentId);
  if (col.length < 2) return false;
  return col.every((id) => selectedIds.has(id));
}

/** Junctions that share a point with `id` (colocated T, no jj edge). */
export function colocatedJunctionIds(
  graph: RoutingGraph,
  id: string,
): Set<string> {
  const out = new Set<string>([id]);
  const seed = graph.junctions[id];
  if (!seed) return out;
  for (const [oid, j] of Object.entries(graph.junctions)) {
    if (Math.abs(j.x - seed.x) > 0.51) continue;
    if (Math.abs(j.y - seed.y) > 0.51) continue;
    out.add(oid);
  }
  return out;
}

/**
 * Endpoints of these spans plus colocated T junctions — the set that slides
 * when a single bus V is dragged (attached H stubs stretch).
 */
export function spanTranslateJunctionIds(
  graph: RoutingGraph,
  segmentIds: Iterable<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const sid of segmentIds) {
    const seg = graph.segments[sid];
    if (!seg) continue;
    if (seg.a.kind === "junction") {
      for (const id of colocatedJunctionIds(graph, seg.a.junctionId)) {
        ids.add(id);
      }
    }
    if (seg.b.kind === "junction") {
      for (const id of colocatedJunctionIds(graph, seg.b.junctionId)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

/**
 * Live previews when only some bus junctions slide in X or Y. Stubs attached
 * to moved T-junctions stretch; unmoved neighbors become an L (no U-bend).
 */
export function previewSegmentsForMovedJunctions(
  graph: RoutingGraph,
  nodes: Node[],
  movedIds: ReadonlySet<string>,
  axis: "x" | "y",
  newValue: number,
  excludeSegmentId: string,
): Map<string, OrthoPoint[]> {
  const v = snapToGrid(newValue);
  const out = new Map<string, OrthoPoint[]>();
  const shifted = (p: OrthoPoint, move: boolean): OrthoPoint => {
    if (!move) return { x: p.x, y: p.y };
    return axis === "x" ? { x: v, y: p.y } : { x: p.x, y: v };
  };
  for (const seg of Object.values(graph.segments)) {
    if (seg.id === excludeSegmentId) continue;
    const atA = seg.a.kind === "junction" && movedIds.has(seg.a.junctionId);
    const atB = seg.b.kind === "junction" && movedIds.has(seg.b.junctionId);
    if (!atA && !atB) continue;
    const a = resolveEndpointPos(seg.a, nodes, graph);
    const b = resolveEndpointPos(seg.b, nodes, graph);
    if (!a || !b) continue;
    const a2 = shifted(a, atA);
    const b2 = shifted(b, atB);
    let pts: OrthoPoint[];
    if (atA && atB) {
      pts = [a2, b2];
    } else if (
      Math.abs(a2.x - b2.x) < 0.51 ||
      Math.abs(a2.y - b2.y) < 0.51
    ) {
      pts = [a2, b2];
    } else if (axis === "x") {
      const moved = atA ? a2 : b2;
      const unmoved = atA ? b2 : a2;
      pts = [a2, { x: unmoved.x, y: moved.y }, b2];
    } else {
      const moved = atA ? a2 : b2;
      const unmoved = atA ? b2 : a2;
      pts = [a2, { x: moved.x, y: unmoved.y }, b2];
    }
    out.set(seg.id, simplifyOrthoPoints(pts));
  }
  return out;
}

/**
 * Slide only this span's endpoints (and colocated T points). Attached H stubs
 * change length. Neighbor jj runs that share one end become an L at the
 * moved row so the rest of the column stays put.
 */
export function translateSpanJunctions(
  graph: RoutingGraph,
  segmentId: string,
  axis: "x" | "y",
  newValue: number,
  extraSegmentIds?: Iterable<string>,
): RoutingGraph {
  const ids = spanTranslateJunctionIds(graph, [
    segmentId,
    ...(extraSegmentIds ?? []),
  ]);
  if (ids.size === 0) return graph;

  const updates: Record<string, { x?: number; y?: number }> = {};
  const snapped = snapToGrid(newValue);
  for (const id of ids) {
    updates[id] = axis === "x" ? { x: snapped } : { y: snapped };
  }
  let next = moveRoutingJunctions(graph, updates);

  for (const sid of Object.keys(next.segments)) {
    const s = next.segments[sid]!;
    const atA = s.a.kind === "junction" && ids.has(s.a.junctionId);
    const atB = s.b.kind === "junction" && ids.has(s.b.junctionId);
    if (!atA && !atB) continue;
    if (s.a.kind !== "junction" || s.b.kind !== "junction") {
      continue;
    }
    if (atA && atB) {
      if (s.cornersAbs?.length) {
        next = setSegmentCornersNorm(next, sid, undefined);
      }
      continue;
    }
    const ja = next.junctions[s.a.junctionId];
    const jb = next.junctions[s.b.junctionId];
    if (!ja || !jb) continue;
    if (Math.abs(ja.x - jb.x) < 0.51 || Math.abs(ja.y - jb.y) < 0.51) {
      if (s.cornersAbs?.length) {
        next = setSegmentCornersNorm(next, sid, undefined);
      }
      continue;
    }
    const moved = atA ? ja : jb;
    const unmoved = atA ? jb : ja;
    const elbow =
      axis === "x"
        ? { x: unmoved.x, y: moved.y }
        : { x: moved.x, y: unmoved.y };
    next = setSegmentCornersNorm(next, sid, [elbow], {
      sx: ja.x,
      sy: ja.y,
      tx: jb.x,
      ty: jb.y,
    });
  }
  return next;
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
  if (axis === "x") {
    // Vertical column: every junction on this X moves together — including
    // colocated ports that share a point (no jj segment between them).
    for (const [id, j] of Object.entries(graph.junctions)) {
      if (Math.abs(j.x - oldValue) <= 0.51) ids.add(id);
    }
  } else {
    const queue = [seg.a.junctionId, seg.b.junctionId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (ids.has(id)) continue;
      const j = graph.junctions[id];
      if (!j) continue;
      if (Math.abs(j.y - oldValue) > 0.51) continue;
      ids.add(id);
      for (const s of Object.values(graph.segments)) {
        if (s.a.kind !== "junction" || s.b.kind !== "junction") continue;
        if (s.a.junctionId === id) queue.push(s.b.junctionId);
        if (s.b.junctionId === id) queue.push(s.a.junctionId);
      }
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
  anchor?: RouteAnchor,
  nodes?: Node[],
): RoutingGraph {
  const seg = graph.segments[segmentId];
  if (!seg) return graph;
  const next = { ...seg };
  if (!corners || corners.length < 1) {
    delete next.cornersAbs;
    delete next.cornersNorm;
  } else {
    // Always store absolute corners — norms collapse on axis-aligned segments.
    let sanitized = corners.map((p) => ({ x: p.x, y: p.y }));
    const pin =
      seg.a.kind === "port"
        ? ("start" as const)
        : seg.b.kind === "port"
          ? ("end" as const)
          : ("both" as const);
    if (anchor) {
      const frames =
        nodes && nodes.length > 0
          ? framesForRoutingSegment(nodes, graph, seg)
          : [];
      const raw = assembleOpenPolyline(
        { x: anchor.sx, y: anchor.sy },
        sanitized,
        { x: anchor.tx, y: anchor.ty },
      );
      const fixed = enforcePortStubElbow(
        raw,
        pin,
        frames.length > 0 ? frames : null,
      );
      sanitized = interiorCorners(fixed);
    }
    next.cornersAbs = sanitized;
    delete next.cornersNorm;
  }
  let junctions = graph.junctions;
  // Only park the bus junction on a wrap rail for *around-machine* leave
  // columns (outside the port↔junction span). Normal U-bends / mid kinks
  // must not move the junction or the network disconnects on drag commit.
  const portEp =
    seg.a.kind === "port"
      ? seg.a
      : seg.b.kind === "port"
        ? seg.b
        : null;
  const jEp =
    seg.a.kind === "junction"
      ? seg.a
      : seg.b.kind === "junction"
        ? seg.b
        : null;
  if (
    portEp &&
    jEp &&
    anchor &&
    next.cornersAbs &&
    next.cornersAbs.length >= 2
  ) {
    const c0 = next.cornersAbs[0]!;
    const c1 = next.cornersAbs[1]!;
    if (Math.abs(c0.x - c1.x) < 1.5) {
      const leaveX = c0.x;
      const lo = Math.min(anchor.sx, anchor.tx);
      const hi = Math.max(anchor.sx, anchor.tx);
      const outside = leaveX < lo - 1 || leaveX > hi + 1;
      if (outside) {
        const wrapY =
          seg.a.kind === "port"
            ? next.cornersAbs[next.cornersAbs.length - 1]!.y
            : next.cornersAbs[0]!.y;
        const j = junctions[jEp.junctionId];
        if (j && Math.abs(j.y - wrapY) > 0.01) {
          const snapped = snapToGrid(wrapY);
          junctions = { ...junctions };
          junctions[jEp.junctionId] = { ...j, y: snapped };
          // Colocated merge points share the bus joint with no jj edge.
          for (const [id, other] of Object.entries(junctions)) {
            if (id === jEp.junctionId) continue;
            if (Math.abs(other.x - j.x) > 0.51) continue;
            if (Math.abs(other.y - j.y) > 0.51) continue;
            junctions[id] = { ...other, y: snapped };
          }
        }
      }
    }
  }
  return {
    ...graph,
    junctions,
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
