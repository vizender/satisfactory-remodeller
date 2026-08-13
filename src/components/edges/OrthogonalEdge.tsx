import {
  BaseEdge,
  EdgeLabelRenderer,
  useStore,
  useStoreApi,
  type EdgeProps,
} from "@xyflow/react";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  beginMidHandleKink,
  clampPortStubs,
  clampOpenPortClearance,
  collectHorizontalSegments,
  collectVerticalSegments,
  detectIntersectionLocks,
  findBridgeCrossings,
  forceOrthogonal,
  fuseRouteOnRelease,
  interiorCorners,
  isDetourWrapRail,
  locksChanged,
  MIN_PORT_STUB,
  moveCorner2D,
  moveCorner2DOpen,
  moveSegment,
  moveSegmentOpen,
  type OpenKinkPin,
  orthogonalizeOpen,
  orthogonalLabelPosition,
  partnerIdsNeedingLockRefresh,
  pointsToSvgPath,
  pointsToSvgPathWithBridges,
  resolveEdgeRouteFromNodes,
  resolveRoutePoints,
  routeSegments,
  snapHorizontalY,
  snapVerticalX,
  CORNER_SNAP_OVERLAP_PAD,
  VERTICAL_SNAP_HOLD,
} from "@/lib/orthogonalEdgePath";
import {
  clearOrthoDragPreview,
  getOrthoDragPreview,
  getOrthoDragPreviewVersion,
  setOrthoDragPreview,
  subscribeOrthoDragPreview,
} from "@/lib/orthoDragPreview";
import {
  composeLogicalRoutePoints,
  previewSegmentsForJunctionY,
  resolveEndpointPos,
  resolveSegmentPoints,
  segmentNetworkEdgeId,
} from "@/lib/routingGraph";
import type { RoutingSegment } from "@/types/routingGraph";
import {
  getEdgeBendX,
  getEdgeCorners,
  getEdgeCornersNorm,
  getLockedVerticals,
  type OrthoPoint,
} from "@/types/edgeData";
import { useDocumentStore } from "@/store/useDocumentStore";
import type { RoutingSegmentEdgeData } from "@/types/routingGraph";

const HIT_STROKE_SCREEN_PX = 21;
const HANDLE_HIT_PX = 28;

type SegmentDragState = {
  mode: "segment";
  pointerId: number;
  segmentIndex: number;
  axis: "h" | "v";
  startPoints: OrthoPoint[];
  startPointer: { x: number; y: number };
  heldSnapX: number | null;
  heldSnapY: number | null;
  latestPoints: OrthoPoint[];
  expanded: boolean;
  /** Other shift-selected routing segments (same axis) updated in parallel. */
  companions: {
    id: string;
    startPoints: OrthoPoint[];
    latestPoints: OrthoPoint[];
    segmentIndex: number;
  }[];
  /** Junction whose Y follows a wrap-rail drag — neighbor previews stay attached. */
  wrapJunctionId?: string;
  /** Segment ids that received live junction-Y previews (cleared on release). */
  junctionPreviewIds?: string[];
};

type CornerDragState = {
  mode: "corner";
  pointerId: number;
  cornerIndex: number;
  /** Geometry frozen at pointer-down (before this frame's move). */
  startPoints: OrthoPoint[];
  latestPoints: OrthoPoint[];
  heldSnapX: number | null;
  heldSnapY: number | null;
  /** Port pin for open routing stubs (keeps V outside the machine). */
  openPin?: OpenKinkPin;
};

type DragState = SegmentDragState | CornerDragState;

function openKinkPin(seg: RoutingSegment | undefined): OpenKinkPin {
  if (!seg) return "both";
  if (seg.a.kind === "port") return "start";
  if (seg.b.kind === "port") return "end";
  return "both";
}

function clientToFlow(
  clientX: number,
  clientY: number,
  transform: [number, number, number],
): { x: number; y: number } {
  const [tx, ty, zoom] = transform;
  return {
    x: (clientX - tx) / zoom,
    y: (clientY - ty) / zoom,
  };
}

/** Same-network segments only — foreign feeds must not snap/fuse trunks. */
function cornerSnapTargets(edgeId: string, networkEdgeId: string) {
  const { nodes, edges, routingGraph } = useDocumentStore.getState();
  const resolvePoints = (e: typeof edges[number]) =>
    composeLogicalRoutePoints(e, nodes, routingGraph);
  return {
    othersV: collectVerticalSegments(edges, nodes, edgeId, {
      sameNetworkAs: networkEdgeId,
      resolvePoints,
    }),
    othersH: collectHorizontalSegments(edges, nodes, edgeId, {
      sameNetworkAs: networkEdgeId,
      resolvePoints,
    }),
  };
}

function applyCornerSnaps(
  points: OrthoPoint[],
  cornerIndex: number,
  edgeId: string,
  networkEdgeId: string,
  heldSnapX: number | null,
  heldSnapY: number | null,
  openChain = false,
): { points: OrthoPoint[]; heldSnapX: number | null; heldSnapY: number | null } {
  if (!points[cornerIndex]) return { points, heldSnapX, heldSnapY };

  const { othersV, othersH } = cornerSnapTargets(edgeId, networkEdgeId);
  let next = points;
  let nextHeldX = heldSnapX;
  let nextHeldY = heldSnapY;
  const corner = next[cornerIndex]!;
  const moveCorner = openChain ? moveCorner2DOpen : moveCorner2D;

  // Prefer snapping the corner's X/Y directly (works even for tiny kink jogs).
  const vertSegs = routeSegments(next).filter(
    (s) =>
      !s.horizontal &&
      (s.index === cornerIndex - 1 || s.index === cornerIndex),
  );
  const y1 = vertSegs.length
    ? Math.min(...vertSegs.map((s) => Math.min(s.a.y, s.b.y)), corner.y)
    : corner.y;
  const y2 = vertSegs.length
    ? Math.max(...vertSegs.map((s) => Math.max(s.a.y, s.b.y)), corner.y)
    : corner.y;

  const snappedX = snapVerticalX(
    corner.x,
    y1,
    y2,
    othersV,
    nextHeldX,
    CORNER_SNAP_OVERLAP_PAD,
  );
  if (Math.abs(snappedX - corner.x) > 0.5) {
    next = moveCorner(next, cornerIndex, snappedX, next[cornerIndex]!.y);
    nextHeldX = snappedX;
  } else if (
    nextHeldX !== null &&
    Math.abs(corner.x - nextHeldX) >= VERTICAL_SNAP_HOLD
  ) {
    nextHeldX = null;
  }

  const cornerAfter = next[cornerIndex]!;
  const horizSegs = routeSegments(next).filter(
    (s) =>
      s.horizontal &&
      (s.index === cornerIndex - 1 || s.index === cornerIndex),
  );
  const x1 = horizSegs.length
    ? Math.min(...horizSegs.map((s) => Math.min(s.a.x, s.b.x)), cornerAfter.x)
    : cornerAfter.x;
  const x2 = horizSegs.length
    ? Math.max(...horizSegs.map((s) => Math.max(s.a.x, s.b.x)), cornerAfter.x)
    : cornerAfter.x;

  const snappedY = snapHorizontalY(
    cornerAfter.y,
    x1,
    x2,
    othersH,
    nextHeldY,
    CORNER_SNAP_OVERLAP_PAD,
  );
  if (Math.abs(snappedY - cornerAfter.y) > 0.5) {
    next = moveCorner(next, cornerIndex, next[cornerIndex]!.x, snappedY);
    nextHeldY = snappedY;
  } else if (
    nextHeldY !== null &&
    Math.abs(cornerAfter.y - nextHeldY) >= VERTICAL_SNAP_HOLD
  ) {
    nextHeldY = null;
  }

  return { points: next, heldSnapX: nextHeldX, heldSnapY: nextHeldY };
}

function OrthogonalEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    selected,
    data,
  } = props;

  const transform = useStore((s) => s.transform);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const storeApi = useStoreApi();

  const idRef = useRef(id);
  idRef.current = id;

  const endsRef = useRef({ sourceX, sourceY, targetX, targetY });
  endsRef.current = { sourceX, sourceY, targetX, targetY };

  const setEdgeCorners = useDocumentStore((s) => s.setEdgeCorners);
  const setEdgeLockedVerticalXs = useDocumentStore(
    (s) => s.setEdgeLockedVerticalXs,
  );
  const docNodes = useDocumentStore((s) => s.nodes);
  const docEdges = useDocumentStore((s) => s.edges);
  const routingGraph = useDocumentStore((s) => s.routingGraph);
  const [dragPoints, setDragPoints] = useState<OrthoPoint[] | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const isRoutingSegment =
    (data as RoutingSegmentEdgeData | undefined)?.kind === "routingSegment";
  const isRoutingSegmentRef = useRef(isRoutingSegment);
  isRoutingSegmentRef.current = isRoutingSegment;
  const networkEdgeId =
    (isRoutingSegment
      ? segmentNetworkEdgeId(id, docEdges)
      : undefined) ?? id;
  const networkEdgeIdRef = useRef(networkEdgeId);
  networkEdgeIdRef.current = networkEdgeId;

  const selectThisEdge = (mode: "replace" | "keep-multi" = "replace") => {
    const st = storeApi.getState();
    if (mode === "keep-multi") {
      st.addSelectedEdges([idRef.current]);
      return;
    }
    st.resetSelectedElements();
    st.addSelectedEdges([idRef.current]);
  };

  const resolveLogicalPoints = (e: (typeof docEdges)[number]) =>
    composeLogicalRoutePoints(e, docNodes, routingGraph);

  /** Re-render when another edge’s drag preview moves (live bridges). */
  useSyncExternalStore(
    subscribeOrthoDragPreview,
    getOrthoDragPreviewVersion,
    getOrthoDragPreviewVersion,
  );

  const segmentData =
    isRoutingSegment && routingGraph.segments[id]
      ? {
          itemId: routingGraph.segments[id]!.itemId,
          cornersAbs: routingGraph.segments[id]!.cornersAbs,
          cornersNorm: routingGraph.segments[id]!.cornersNorm,
        }
      : data;

  const basePoints = (() => {
    const live = getOrthoDragPreview(id);
    if (live && live.length >= 2 && !dragPoints) return live;
    if (isRoutingSegment) {
      const seg = routingGraph.segments[id];
      if (seg) {
        const resolved = resolveSegmentPoints(seg, docNodes, routingGraph, id);
        if (resolved) return resolved;
      }
      if (
        Math.abs(sourceY - targetY) < 0.51 ||
        Math.abs(sourceX - targetX) < 0.51
      ) {
        return [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ];
      }
    }
    return resolveRoutePoints(
      sourceX,
      sourceY,
      targetX,
      targetY,
      segmentData,
      id,
    );
  })();
  const points = dragPoints ?? basePoints;
  const bridgeCrossings = findBridgeCrossings(id, points, docEdges, docNodes, {
    networkEdgeId,
    resolvePoints: resolveLogicalPoints,
  });
  const path = pointsToSvgPathWithBridges(points, bridgeCrossings);
  /** Hit testing stays on the straight ortholinear spine. */
  const hitPath = pointsToSvgPath(points);
  const { x: labelX, y: labelY } = orthogonalLabelPosition(
    sourceX,
    sourceY,
    targetX,
    targetY,
    segmentData,
  );
  const segs = routeSegments(points);
  const showHandles = selected || dragPoints !== null;
  const interiorPointIndices = points
    .map((_, i) => i)
    .filter((i) => i > 0 && i < points.length - 1);

  useEffect(() => {
    if (dragPoints) setOrthoDragPreview(id, dragPoints);
    else clearOrthoDragPreview(id);
    return () => clearOrthoDragPreview(id);
  }, [id, dragPoints]);

  useEffect(() => {
    if (isRoutingSegment) return;
    if (getEdgeCornersNorm(data)) return;
    if (!getEdgeCorners(data) && getEdgeBendX(data) === undefined) return;
    const pts = resolveRoutePoints(sourceX, sourceY, targetX, targetY, data);
    setEdgeCorners(id, interiorCorners(pts), {
      sx: sourceX,
      sy: sourceY,
      tx: targetX,
      ty: targetY,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migrate once per edge data shape
  }, [id, data, isRoutingSegment]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      e.preventDefault();
      const pointer = clientToFlow(
        e.clientX,
        e.clientY,
        transformRef.current,
      );

      if (st.mode === "corner") {
        const isSeg = isRoutingSegmentRef.current;
        const pin = st.openPin ?? "both";
        let next = isSeg
          ? moveCorner2DOpen(
              st.startPoints,
              st.cornerIndex,
              pointer.x,
              pointer.y,
              pin,
            )
          : moveCorner2D(
              st.startPoints,
              st.cornerIndex,
              pointer.x,
              pointer.y,
            );
        const snapped = applyCornerSnaps(
          next,
          st.cornerIndex,
          idRef.current,
          networkEdgeIdRef.current,
          st.heldSnapX,
          st.heldSnapY,
          isSeg,
        );
        next = isSeg
          ? clampOpenPortClearance(snapped.points, pin)
          : snapped.points;
        st.heldSnapX = snapped.heldSnapX;
        st.heldSnapY = snapped.heldSnapY;
        st.latestPoints = next;
        setDragPoints(next);
        return;
      }

      const isSeg = isRoutingSegmentRef.current;
      const segMeta = isSeg
        ? useDocumentStore.getState().routingGraph.segments[idRef.current]
        : undefined;
      const result = isSeg
        ? moveSegmentOpen(
            st.segmentIndex,
            pointer,
            st.startPoints,
            st.startPointer,
            {
              // Always U-bend with fixed endpoints — never slide the whole bus.
              // Shift-selected companions mirror the same local edit.
              translateStraight: false,
              pin: openKinkPin(segMeta),
            },
          )
        : moveSegment(
            st.latestPoints,
            st.segmentIndex,
            pointer,
            st.startPoints,
            st.startPointer,
          );

      let next = result.points;

      if (!st.expanded && result.activeSegmentIndex !== st.segmentIndex) {
        st.expanded = true;
        st.segmentIndex = result.activeSegmentIndex;
        st.startPoints = next.map((p) => ({ ...p }));
        st.startPointer = pointer;
        const newSeg = routeSegments(next)[st.segmentIndex];
        st.axis = newSeg?.horizontal ? "h" : "v";
        st.heldSnapX = newSeg && !newSeg.horizontal ? newSeg.a.x : null;
        st.heldSnapY = newSeg?.horizontal ? newSeg.a.y : null;
      }

      // Soft-snap free H/V onto same-network neighbors (also open routing stubs).
      const movedSeg = routeSegments(next)[st.segmentIndex];
      if (movedSeg && !movedSeg.horizontal) {
        const { nodes, edges, routingGraph: rg } = useDocumentStore.getState();
        const others = collectVerticalSegments(edges, nodes, idRef.current, {
          sameNetworkAs: networkEdgeIdRef.current,
          resolvePoints: (ed) => composeLogicalRoutePoints(ed, nodes, rg),
        });
        const snappedX = snapVerticalX(
          movedSeg.a.x,
          Math.min(movedSeg.a.y, movedSeg.b.y),
          Math.max(movedSeg.a.y, movedSeg.b.y),
          others,
          st.heldSnapX,
        );
        if (Math.abs(snappedX - movedSeg.a.x) > 0.5) {
          const ends = endsRef.current;
          let x = snappedX;
          if (!isSeg) {
            if (st.segmentIndex <= 1) {
              x = Math.max(x, ends.sourceX + MIN_PORT_STUB);
            }
            if (st.segmentIndex >= next.length - 3) {
              x = Math.min(x, ends.targetX - MIN_PORT_STUB);
            }
          } else {
            const pin = openKinkPin(
              useDocumentStore.getState().routingGraph.segments[idRef.current],
            );
            if (pin === "start") {
              x = Math.max(x, next[0]!.x + MIN_PORT_STUB);
            } else if (pin === "end") {
              x = Math.min(x, next[next.length - 1]!.x - MIN_PORT_STUB);
            }
          }
          const pts = next.map((p) => ({ ...p }));
          const i = st.segmentIndex;
          if (pts[i] && pts[i + 1]) {
            pts[i] = { x, y: pts[i]!.y };
            pts[i + 1] = { x, y: pts[i + 1]!.y };
            pts[0] = { ...next[0]! };
            pts[pts.length - 1] = { ...next[next.length - 1]! };
            if (isSeg) {
              const pin = openKinkPin(
                useDocumentStore.getState().routingGraph.segments[
                  idRef.current
                ],
              );
              next = clampOpenPortClearance(orthogonalizeOpen(pts), pin);
            } else {
              next = clampPortStubs(forceOrthogonal(pts));
            }
          }
          st.heldSnapX = x;
        } else if (
          st.heldSnapX !== null &&
          Math.abs(movedSeg.a.x - st.heldSnapX) >= VERTICAL_SNAP_HOLD
        ) {
          st.heldSnapX = null;
        }
      } else if (movedSeg?.horizontal) {
        const { nodes, edges, routingGraph: rg } = useDocumentStore.getState();
        const others = collectHorizontalSegments(edges, nodes, idRef.current, {
          sameNetworkAs: networkEdgeIdRef.current,
          resolvePoints: (ed) => composeLogicalRoutePoints(ed, nodes, rg),
        });
        const snappedY = snapHorizontalY(
          movedSeg.a.y,
          Math.min(movedSeg.a.x, movedSeg.b.x),
          Math.max(movedSeg.a.x, movedSeg.b.x),
          others,
          st.heldSnapY,
        );
        if (Math.abs(snappedY - movedSeg.a.y) > 0.5) {
          const pts = next.map((p) => ({ ...p }));
          const i = st.segmentIndex;
          if (pts[i] && pts[i + 1]) {
            pts[i] = { x: pts[i]!.x, y: snappedY };
            pts[i + 1] = { x: pts[i + 1]!.x, y: snappedY };
            pts[0] = { ...next[0]! };
            pts[pts.length - 1] = { ...next[next.length - 1]! };
            next = isSeg
              ? clampOpenPortClearance(
                  orthogonalizeOpen(pts),
                  openKinkPin(
                    useDocumentStore.getState().routingGraph.segments[
                      idRef.current
                    ],
                  ),
                )
              : clampPortStubs(forceOrthogonal(pts));
          }
          st.heldSnapY = snappedY;
        } else if (
          st.heldSnapY !== null &&
          Math.abs(movedSeg.a.y - st.heldSnapY) >= VERTICAL_SNAP_HOLD
        ) {
          st.heldSnapY = null;
        }
      }

      st.latestPoints = next;
      setDragPoints(next);

      // Wrap-rail drag: slide the shared junction Y on neighbor previews so the
      // bus V stays attached during the pointer move (commit still on release).
      if (
        isSeg &&
        st.mode === "segment" &&
        st.wrapJunctionId &&
        next.length >= 2
      ) {
        const { nodes, routingGraph: rg } = useDocumentStore.getState();
        const pin = openKinkPin(rg.segments[idRef.current]);
        const wrapY =
          pin === "start" ? next[next.length - 1]!.y : next[0]!.y;
        const previews = previewSegmentsForJunctionY(
          rg,
          nodes,
          st.wrapJunctionId,
          wrapY,
          idRef.current,
        );
        const prevIds = st.junctionPreviewIds ?? [];
        for (const [sid, pts] of previews) {
          setOrthoDragPreview(sid, pts);
        }
        for (const sid of prevIds) {
          if (!previews.has(sid)) clearOrthoDragPreview(sid);
        }
        st.junctionPreviewIds = [...previews.keys()];
      }

      // Shift-multi-select: mirror the same pointer delta onto other selected
      // same-axis routing segments — never rewrite unselected neighbors.
      if (isSeg && st.mode === "segment" && st.companions.length > 0) {
        const { nodes, routingGraph: rg } = useDocumentStore.getState();
        for (const c of st.companions) {
          const meta = rg.segments[c.id];
          const moved = moveSegmentOpen(
            c.segmentIndex,
            pointer,
            c.startPoints,
            st.startPointer,
            { pin: openKinkPin(meta) },
          );
          c.latestPoints = moved.points;
          c.segmentIndex = moved.activeSegmentIndex;
          setOrthoDragPreview(c.id, moved.points);
          void nodes;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const { nodes, edges, routingGraph: rg } = useDocumentStore.getState();
      const edgeId = idRef.current;
      const isSeg = isRoutingSegmentRef.current;
      const pts = isSeg
        ? clampOpenPortClearance(
            orthogonalizeOpen(st.latestPoints),
            st.mode === "corner"
              ? (st.openPin ?? "both")
              : openKinkPin(
                  useDocumentStore.getState().routingGraph.segments[edgeId],
                ),
          )
        : fuseRouteOnRelease(st.latestPoints, edgeId, edges, nodes);
      const companions =
        st.mode === "segment" ? st.companions.map((c) => ({ ...c })) : [];
      const junctionPreviewIds =
        st.mode === "segment" ? [...(st.junctionPreviewIds ?? [])] : [];
      dragRef.current = null;
      setDragPoints(null);
      for (const sid of junctionPreviewIds) {
        clearOrthoDragPreview(sid);
      }

      let anchor = {
        sx: endsRef.current.sourceX,
        sy: endsRef.current.sourceY,
        tx: endsRef.current.targetX,
        ty: endsRef.current.targetY,
      };
      if (isSeg) {
        const seg = rg.segments[edgeId];
        if (seg) {
          const a = resolveEndpointPos(seg.a, nodes, rg);
          const b = resolveEndpointPos(seg.b, nodes, rg);
          if (a && b) {
            anchor = { sx: a.x, sy: a.y, tx: b.x, ty: b.y };
          }
        }
      }
      const locks = isSeg
        ? []
        : detectIntersectionLocks(edgeId, pts, edges, nodes);
      // Persist local geometry only (U-bend / kink). Never translateRailJunctions
      // — that moved the entire shared bus column on a single-segment drag.
      setEdgeCorners(edgeId, interiorCorners(pts), anchor, locks);

      if (isSeg) {
        // Commit companion segments only (shift-selected); leave others untouched.
        for (const c of companions) {
          clearOrthoDragPreview(c.id);
          const seg = rg.segments[c.id];
          if (!seg) continue;
          const a = resolveEndpointPos(seg.a, nodes, rg);
          const b = resolveEndpointPos(seg.b, nodes, rg);
          if (!a || !b) continue;
          const cPts = orthogonalizeOpen(c.latestPoints);
          setEdgeCorners(c.id, interiorCorners(cPts), {
            sx: a.x,
            sy: a.y,
            tx: b.x,
            ty: b.y,
          });
        }
        return;
      }

      const fresh = useDocumentStore.getState();
      for (const partnerId of partnerIdsNeedingLockRefresh(
        edgeId,
        pts,
        fresh.edges,
        fresh.nodes,
      )) {
        const partner = fresh.edges.find((ed) => ed.id === partnerId);
        if (!partner) continue;
        const resolved = resolveEdgeRouteFromNodes(partner, fresh.nodes);
        if (!resolved) continue;
        const nextLocks = detectIntersectionLocks(
          partnerId,
          resolved.points,
          fresh.edges,
          fresh.nodes,
        );
        if (locksChanged(getLockedVerticals(partner.data), nextLocks)) {
          setEdgeLockedVerticalXs(partnerId, nextLocks);
        }
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [setEdgeCorners, setEdgeLockedVerticalXs]);

  const beginSegmentDrag = (e: React.PointerEvent, segmentIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rfEdges = storeApi.getState().edges;
    const selfSelected = rfEdges.some((ed) => ed.id === id && ed.selected);
    const multiSelected =
      selfSelected &&
      rfEdges.filter((ed) => ed.selected && ed.id.startsWith("rs-")).length > 1;
    // Keep an existing shift-multi selection; otherwise solo-select this edge.
    selectThisEdge(e.shiftKey || multiSelected ? "keep-multi" : "replace");
    const seg = segs[segmentIndex];
    if (!seg) return;
    const pointer = clientToFlow(e.clientX, e.clientY, transformRef.current);
    const startPoints = points.map((p) => ({ ...p }));

    const companions: SegmentDragState["companions"] = [];
    let wrapJunctionId: string | undefined;
    if (isRoutingSegment) {
      const selectedNow = storeApi.getState().edges;
      const { nodes, routingGraph: rg } = useDocumentStore.getState();
      const meta = rg.segments[id];
      const pin = openKinkPin(meta);
      if (meta && isDetourWrapRail(startPoints, segmentIndex, pin)) {
        if (meta.a.kind === "junction") wrapJunctionId = meta.a.junctionId;
        else if (meta.b.kind === "junction") wrapJunctionId = meta.b.junctionId;
      }
      for (const ed of selectedNow) {
        if (!ed.selected || ed.id === id) continue;
        if (!ed.id.startsWith("rs-")) continue;
        const otherMeta = rg.segments[ed.id];
        if (!otherMeta) continue;
        const resolved = resolveSegmentPoints(otherMeta, nodes, rg, ed.id);
        if (!resolved || resolved.length < 2) continue;
        const otherSegs = routeSegments(resolved);
        // Only mirror onto same-orientation free runs so H stubs aren't
        // yanked when dragging a V bus (and vice versa).
        const match = otherSegs.find(
          (s) => s.horizontal === seg.horizontal && s.length >= 4,
        );
        if (!match) continue;
        companions.push({
          id: ed.id,
          startPoints: resolved.map((p) => ({ ...p })),
          latestPoints: resolved.map((p) => ({ ...p })),
          segmentIndex: match.index,
        });
      }
    }

    dragRef.current = {
      mode: "segment",
      pointerId: e.pointerId,
      segmentIndex,
      axis: seg.horizontal ? "h" : "v",
      startPoints,
      startPointer: pointer,
      heldSnapX: seg.horizontal ? null : seg.a.x,
      heldSnapY: seg.horizontal ? seg.a.y : null,
      latestPoints: startPoints,
      expanded: false,
      companions,
      wrapJunctionId,
      junctionPreviewIds: [],
    };
    setDragPoints(startPoints);
  };

  const beginCornerDrag = (e: React.PointerEvent, cornerIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rfEdges = storeApi.getState().edges;
    const selfSelected = rfEdges.some((ed) => ed.id === id && ed.selected);
    const multiSelected =
      selfSelected && rfEdges.filter((ed) => ed.selected).length > 1;
    selectThisEdge(e.shiftKey || multiSelected ? "keep-multi" : "replace");
    const startPoints = points.map((p) => ({ ...p }));
    const segMeta = isRoutingSegment
      ? routingGraph.segments[id]
      : undefined;
    dragRef.current = {
      mode: "corner",
      pointerId: e.pointerId,
      cornerIndex,
      startPoints,
      latestPoints: startPoints,
      heldSnapX: null,
      heldSnapY: null,
      openPin: isRoutingSegment ? openKinkPin(segMeta) : undefined,
    };
    setDragPoints(startPoints);
  };

  const beginMidHandleDrag = (e: React.PointerEvent, segmentIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rfEdges = storeApi.getState().edges;
    const selfSelected = rfEdges.some((ed) => ed.id === id && ed.selected);
    const multiSelected =
      selfSelected && rfEdges.filter((ed) => ed.selected).length > 1;
    selectThisEdge(e.shiftKey || multiSelected ? "keep-multi" : "replace");
    const pointer = clientToFlow(e.clientX, e.clientY, transformRef.current);
    const segMeta = isRoutingSegment
      ? routingGraph.segments[id]
      : undefined;
    const pin = openKinkPin(segMeta);
    // Detour wrap rail: translate Y via segment drag (do not invent a kink).
    if (isRoutingSegment && isDetourWrapRail(points, segmentIndex, pin)) {
      beginSegmentDrag(e, segmentIndex);
      return;
    }
    const { points: kinked, cornerIndex } = beginMidHandleKink(
      points,
      segmentIndex,
      pointer,
      pin,
    );
    if (cornerIndex < 0) {
      beginSegmentDrag(e, segmentIndex);
      return;
    }
    const placed = isRoutingSegment
      ? moveCorner2DOpen(kinked, cornerIndex, pointer.x, pointer.y, pin)
      : moveCorner2D(kinked, cornerIndex, pointer.x, pointer.y);
    // Re-find elbow after orthogonalize may have shifted indices
    const elbow = placed[cornerIndex] ?? kinked[cornerIndex];
    let liveCorner = cornerIndex;
    if (elbow) {
      let best = Infinity;
      for (let i = 1; i < placed.length - 1; i++) {
        const d = Math.hypot(placed[i]!.x - elbow.x, placed[i]!.y - elbow.y);
        if (d < best) {
          best = d;
          liveCorner = i;
        }
      }
    }
    // Don't snap on pointer-down — that collapses brand-new kinks into nearby
    // trunks before the user can drag. Snap runs on move + release only.
    dragRef.current = {
      mode: "corner",
      pointerId: e.pointerId,
      cornerIndex: liveCorner,
      startPoints: placed.map((p) => ({ ...p })),
      latestPoints: placed,
      heldSnapX: null,
      heldSnapY: null,
      openPin: isRoutingSegment ? pin : undefined,
    };
    setDragPoints(placed);
  };

  const handleSize = HANDLE_HIT_PX;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        style={{
          ...style,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          // Visual stroke comes from SharedRoutingOverlay so belts stay visible
          // even before junction handles are measured by React Flow.
          ...(isRoutingSegment ? { stroke: "transparent" } : null),
        }}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={HIT_STROKE_SCREEN_PX}
      />
      <path
        d={hitPath}
        fill="none"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={HIT_STROKE_SCREEN_PX}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "stroke" }}
        className="react-flow__edge-hitpad"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const rfEdges = storeApi.getState().edges;
          const selfSelected = rfEdges.some(
            (ed) => ed.id === id && ed.selected,
          );
          const multiSelected =
            selfSelected && rfEdges.filter((ed) => ed.selected).length > 1;
          selectThisEdge(
            e.shiftKey || multiSelected ? "keep-multi" : "replace",
          );
        }}
      />
      <g className="nodrag nopan">
        {segs.map((s) => {
          if (s.length < 2) return null;
          return (
            <line
              key={`hit-${s.index}`}
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              stroke="transparent"
              strokeWidth={14}
              style={{
                cursor: s.horizontal ? "ns-resize" : "ew-resize",
                pointerEvents: "stroke",
              }}
              onPointerDown={(e) => beginSegmentDrag(e, s.index)}
            />
          );
        })}
      </g>
      {showHandles ? (
        <EdgeLabelRenderer>
          {interiorPointIndices.map((i) => {
            const p = points[i]!;
            return (
              <div
                key={`corner-${id}-${i}`}
                className="nodrag nopan rf-ortho-corner-handle"
                style={{
                  position: "absolute",
                  transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
                  width: handleSize,
                  height: handleSize,
                  borderRadius: "50%",
                  pointerEvents: "all",
                  cursor: "move",
                  zIndex: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPointerDown={(e) => beginCornerDrag(e, i)}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    border: "1.5px solid var(--surface)",
                    boxShadow:
                      "0 0 2px color-mix(in srgb, var(--accent) 40%, transparent)",
                    pointerEvents: "none",
                  }}
                />
              </div>
            );
          })}
          {(() => {
            // One mid-handle on the longest run — short port-adjacent jogs were
            // getting their own "center" dots that looked offset on input stubs.
            const primary = [...segs].sort((a, b) => b.length - a.length)[0];
            if (!primary || primary.length < 24) return null;
            const midX = primary.a.x + (primary.b.x - primary.a.x) / 2;
            const midY = primary.a.y + (primary.b.y - primary.a.y) / 2;
            return (
              <div
                key={`mid-${id}-${primary.index}`}
                className="nodrag nopan rf-ortho-bend-handle"
                style={{
                  position: "absolute",
                  transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
                  width: handleSize,
                  height: handleSize,
                  borderRadius: "50%",
                  pointerEvents: "all",
                  cursor: "crosshair",
                  zIndex: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPointerDown={(e) => beginMidHandleDrag(e, primary.index)}
                title="Drag to add kink"
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "var(--surface)",
                    border: "1.5px solid var(--accent)",
                    boxShadow:
                      "0 0 2px color-mix(in srgb, var(--accent) 40%, transparent)",
                    pointerEvents: "none",
                  }}
                />
              </div>
            );
          })()}
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const OrthogonalEdge = memo(OrthogonalEdgeImpl);
OrthogonalEdge.displayName = "OrthogonalEdge";
