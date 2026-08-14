import { useReactFlow, useStore } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  computeHops,
  flowOnSegment,
  assignNetColors,
  HOP_RADIUS,
  NET_PALETTE,
  SNAP_ALIGN,
  SNAP_ALIGN_SCREEN,
  segmentEdgeUsers,
  segmentMidpoint,
  snapDragPointer,
  type AlignHit,
  type CrossingHop,
  type DragSnapOpts,
  type Point,
  type RouteGraph,
  type RouteSegment,
  type TopologyEdge,
} from "@/lib/routing";

const PORT_HIT_INSET = 18;

type DragMode = "idle" | "drag" | "kink";

type OverlayDrag = {
  mode: DragMode;
  pointerId: number;
  segmentId: string;
  click: Point;
  snapshot: RouteGraph;
};

function vertexColor(kind: string): string {
  if (kind === "port") return "#64748b";
  if (kind === "3si") return "#ca8a04";
  if (kind === "4si") return "#6d28d9";
  return "#94a3b8";
}

function hopPath(
  a: Point,
  b: Point,
  axis: "h" | "v",
  hops: CrossingHop[],
  r = HOP_RADIUS,
): string {
  if (axis === "h") {
    const y = a.y;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const hits = hops
      .filter((h) => h.x > x0 + r && h.x < x1 - r)
      .sort((p, q) => p.x - q.x);
    const start = a.x <= b.x ? a : b;
    const end = a.x <= b.x ? b : a;
    let d = `M ${start.x} ${y}`;
    let cursor = start.x;
    for (const h of hits) {
      d += ` L ${h.x - r} ${y}`;
      d += ` A ${r} ${r} 0 0 1 ${h.x + r} ${y}`;
      cursor = h.x + r;
    }
    void cursor;
    d += ` L ${end.x} ${y}`;
    return d;
  }
  const x = a.x;
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const hits = hops
    .filter((h) => h.y > y0 + r && h.y < y1 - r)
    .sort((p, q) => p.y - q.y);
  const start = a.y <= b.y ? a : b;
  const end = a.y <= b.y ? b : a;
  let d = `M ${x} ${start.y}`;
  for (const h of hits) {
    d += ` L ${x} ${h.y - r}`;
    d += ` A ${r} ${r} 0 0 1 ${x} ${h.y + r}`;
  }
  d += ` L ${x} ${end.y}`;
  return d;
}

function isPortEnd(v: { portId?: string; kind: string }): boolean {
  return Boolean(v.portId) || v.kind === "port";
}

/** Shorten a segment so its hit stroke does not cover a port handle. */
function hitEndpoints(
  a: Point & { portId?: string; kind: string },
  b: Point & { portId?: string; kind: string },
): { a: Point; b: Point } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const insetA = isPortEnd(a) ? PORT_HIT_INSET : 0;
  const insetB = isPortEnd(b) ? PORT_HIT_INSET : 0;
  if (len < insetA + insetB + 4) return null;
  const ux = dx / len;
  const uy = dy / len;
  return {
    a: { x: a.x + ux * insetA, y: a.y + uy * insetA },
    b: { x: b.x - ux * insetB, y: b.y - uy * insetB },
  };
}

export function RouteOverlay({
  graph,
  selectedSegmentIds,
  debug = false,
  conflictEdgeIds = [],
  topology = [],
  edgeFlow,
  onSelect,
  onDrag,
  onKink,
  onDelete,
  onDragEnd,
  onSegmentContextMenu,
}: {
  graph: RouteGraph;
  selectedSegmentIds: string[];
  debug?: boolean;
  conflictEdgeIds?: string[];
  topology?: TopologyEdge[];
  edgeFlow?: Record<string, number>;
  onSelect: (id: string | null, opts?: { toggle?: boolean }) => void;
  onDrag: (
    segmentId: string,
    snapshot: RouteGraph,
    pointer: Point,
    snap?: DragSnapOpts,
  ) => void;
  onKink: (
    segmentId: string,
    snapshot: RouteGraph,
    click: Point,
    pointer: Point,
    snap?: DragSnapOpts,
  ) => void;
  onDelete: (segmentId: string) => void;
  onDragEnd?: (segmentId: string) => void;
  onSegmentContextMenu?: (segmentId: string, clientX: number, clientY: number) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const transform = useStore((s) => s.transform);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<OverlayDrag | null>(null);
  const dragListeners = useRef<(() => void) | null>(null);
  const [guide, setGuide] = useState<AlignHit | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tx, ty, zoom] = transform;
  const live = useRef({
    onDrag,
    onKink,
    onDragEnd,
    toFlow: (_e: { clientX: number; clientY: number }): Point => ({ x: 0, y: 0 }),
    zoom,
  });
  const verts = useMemo(
    () => new Map(graph.vertices.map((v) => [v.id, v])),
    [graph.vertices],
  );
  const hops = useMemo(() => computeHops(graph), [graph]);
  const hopsBySeg = useMemo(() => {
    const m = new Map<string, CrossingHop[]>();
    for (const h of hops) {
      const list = m.get(h.segmentId) ?? [];
      list.push(h);
      m.set(h.segmentId, list);
    }
    return m;
  }, [hops]);

  const usersBySeg = useMemo(
    () => segmentEdgeUsers(graph, topology),
    [graph, topology],
  );
  const conflictSet = useMemo(
    () => new Set(conflictEdgeIds),
    [conflictEdgeIds],
  );
  const netColors = useMemo(() => assignNetColors(graph), [graph]);

  const toFlow = useCallback(
    (e: { clientX: number; clientY: number }): Point =>
      screenToFlowPosition({ x: e.clientX, y: e.clientY }),
    [screenToFlowPosition],
  );
  live.current = { onDrag, onKink, onDragEnd, toFlow, zoom };

  const stopDrag = useCallback((pointerId?: number) => {
    const st = dragRef.current;
    if (st && pointerId !== undefined && st.pointerId !== pointerId) return;
    dragListeners.current?.();
    dragListeners.current = null;
    setGuide(null);
    setDragging(false);
    const svg = svgRef.current;
    if (svg) {
      if (st) {
        try {
          svg.releasePointerCapture(st.pointerId);
        } catch {
          /* capture already lost */
        }
      }
      svg.style.pointerEvents = "";
    }
    dragRef.current = null;
    if (st) live.current.onDragEnd?.(st.segmentId);
  }, []);

  useEffect(() => {
    return () => {
      dragListeners.current?.();
      dragListeners.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dragRef.current) {
          e.preventDefault();
          stopDrag();
          return;
        }
        if (selectedSegmentIds.length) {
          e.preventDefault();
          onSelect(null);
        }
        return;
      }
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (selectedSegmentIds.length) {
        e.preventDefault();
        for (const id of selectedSegmentIds) onDelete(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSegmentIds, onDelete, onSelect, stopDrag]);

  const beginDrag = (
    e: React.PointerEvent,
    seg: RouteSegment,
    mode: DragMode,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    stopDrag();
    const click = toFlow(e);
    dragRef.current = {
      mode,
      pointerId: e.pointerId,
      segmentId: seg.id,
      click,
      snapshot: graph,
    };
    setDragging(true);
    onSelect(seg.id, { toggle: e.shiftKey });
    const svg = svgRef.current;
    if (svg) {
      svg.style.pointerEvents = "auto";
      svg.setPointerCapture?.(e.pointerId);
    }

    const onMove = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      const { toFlow: flow, onDrag: drag, onKink: kink, zoom: z } =
        live.current;
      const pt = flow(ev);
      const align = ev.altKey
        ? false
        : Math.max(SNAP_ALIGN, SNAP_ALIGN_SCREEN / Math.max(z, 0.05));
      const snapOpts: DragSnapOpts = { align };
      const preview = snapDragPointer(cur.snapshot, cur.segmentId, pt, snapOpts);
      setGuide(preview.hit);
      if (cur.mode === "kink") {
        kink(cur.segmentId, cur.snapshot, cur.click, pt, snapOpts);
      } else if (cur.mode === "drag") {
        drag(cur.segmentId, cur.snapshot, pt, snapOpts);
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      stopDrag(ev.pointerId);
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    dragListeners.current = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  };

  const selectedSet = useMemo(
    () => new Set(selectedSegmentIds),
    [selectedSegmentIds],
  );
  const selectedSegs = graph.segments.filter((s) => selectedSet.has(s.id));

  return (
    <svg
      ref={svgRef}
      className={dragging ? "route-overlay is-dragging" : "route-overlay"}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
        {guide ? (
          guide.axis === "v" ? (
            <line
              className="route-snap-guide"
              x1={guide.coord}
              y1={-20000}
              x2={guide.coord}
              y2={20000}
              strokeWidth={1 / zoom}
            />
          ) : (
            <line
              className="route-snap-guide"
              x1={-20000}
              y1={guide.coord}
              x2={20000}
              y2={guide.coord}
              strokeWidth={1 / zoom}
            />
          )
        ) : null}
        {graph.segments.map((seg) => {
          const a = verts.get(seg.a);
          const b = verts.get(seg.b);
          if (!a || !b) return null;
          const selectedThis = selectedSet.has(seg.id);
          const users = usersBySeg.get(seg.id) ?? [];
          const inConflict = users.some((id) => conflictSet.has(id));
          const color = inConflict
            ? "var(--conflict-edge-stroke)"
            : (netColors.get(seg.netId) ?? NET_PALETTE[0]);
          const flow =
            edgeFlow && users.length > 0
              ? flowOnSegment(graph, seg.id, topology, edgeFlow)
              : 0;
          const d = hopPath(
            a,
            b,
            seg.axis,
            (hopsBySeg.get(seg.id) ?? []).filter((h) => h.axis === seg.axis),
          );
          const hit = hitEndpoints(a, b);
          const hitD = hit
            ? hopPath(
                hit.a,
                hit.b,
                seg.axis,
                (hopsBySeg.get(seg.id) ?? []).filter((h) => h.axis === seg.axis),
              )
            : null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={seg.id}>
              {hitD ? (
                <path
                  className="route-seg-hit"
                  d={hitD}
                  onPointerDown={(ev) => beginDrag(ev, seg, "drag")}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onSelect(seg.id, { toggle: ev.shiftKey });
                    onSegmentContextMenu?.(seg.id, ev.clientX, ev.clientY);
                  }}
                />
              ) : null}
              <path
                className={
                  selectedThis ? "route-seg route-seg-selected" : "route-seg"
                }
                d={d}
                stroke={color}
                strokeWidth={selectedThis ? 3.2 : 2.15}
                style={{ ["--route-color"]: color } as CSSProperties}
              />
              {flow > 0.05 ? (
                <text
                  x={mx}
                  y={my - 6 / zoom}
                  textAnchor="middle"
                  className="route-vertex-label"
                  style={{ fontSize: 10 / zoom, fill: "var(--text)" }}
                >
                  {flow.toFixed(1)}
                </text>
              ) : null}
            </g>
          );
        })}

        {selectedSegs.map((seg) => {
          const mid = segmentMidpoint(graph, seg.id);
          if (!mid) return null;
          const users = usersBySeg.get(seg.id) ?? [];
          const inConflict = users.some((id) => conflictSet.has(id));
          const color = inConflict
            ? "var(--conflict-edge-stroke)"
            : (netColors.get(seg.netId) ?? NET_PALETTE[0]);
          return (
            <circle
              key={`h-${seg.id}`}
              className="route-handle"
              cx={mid.x}
              cy={mid.y}
              r={6 / zoom}
              fill="var(--surface)"
              stroke={color}
              strokeWidth={1.6 / zoom}
              onPointerDown={(ev) => beginDrag(ev, seg, "kink")}
            />
          );
        })}

        {debug
          ? graph.vertices.map((v) => (
              <g key={v.id}>
                <circle
                  cx={v.x}
                  cy={v.y}
                  r={4.5 / zoom}
                  fill={vertexColor(v.kind)}
                  pointerEvents="none"
                />
                <text
                  className="route-vertex-label"
                  x={v.x + 6 / zoom}
                  y={v.y - 6 / zoom}
                  style={{ fontSize: 10 / zoom }}
                >
                  {v.kind}
                  {v.portId ? ` ${v.portId}` : ""}
                </text>
              </g>
            ))
          : null}
      </g>
    </svg>
  );
}
