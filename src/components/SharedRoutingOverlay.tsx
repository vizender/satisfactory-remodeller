import { ViewportPortal } from "@xyflow/react";
import { memo, useMemo, useSyncExternalStore } from "react";
import {
  findBridgeCrossings,
  pointsToSvgPathWithBridges,
} from "@/lib/orthogonalEdgePath";
import {
  getOrthoDragPreview,
  getOrthoDragPreviewVersion,
  subscribeOrthoDragPreview,
} from "@/lib/orthoDragPreview";
import {
  composeLogicalRoutePoints,
  conflictSegmentIdsFromLogical,
  resolveSegmentPoints,
  segmentNetworkEdgeId,
} from "@/lib/routingGraph";
import {
  getSegmentSelectionVersion,
  getSelectedSegmentIds,
  subscribeSegmentSelection,
} from "@/lib/segmentSelection";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useFlowSolveResult } from "@/hooks/useFlowSolve";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";

/**
 * Draws shared routing segments in viewport space.
 * Guarantees belts stay visible even when React Flow has not initialized
 * junction handle bounds yet (which would skip mounting segment edges).
 */
function SharedRoutingOverlayImpl() {
  const edgeRoutingMode = useCanvasUiStore((s) => s.edgeRoutingMode);
  const routingGraph = useDocumentStore((s) => s.routingGraph);
  const nodes = useDocumentStore((s) => s.nodes);
  const edges = useDocumentStore((s) => s.edges);
  const solve = useFlowSolveResult();

  const previewVersion = useSyncExternalStore(
    subscribeOrthoDragPreview,
    getOrthoDragPreviewVersion,
    getOrthoDragPreviewVersion,
  );
  const selectionVersion = useSyncExternalStore(
    subscribeSegmentSelection,
    getSegmentSelectionVersion,
    getSegmentSelectionVersion,
  );

  const conflictSegs = useMemo(
    () => conflictSegmentIdsFromLogical(edges, solve.conflictEdgeIds),
    [edges, solve.conflictEdgeIds],
  );

  const paths = useMemo(() => {
    if (edgeRoutingMode !== "orthogonal") return [];
    void previewVersion;
    void selectionVersion;
    const selected = getSelectedSegmentIds();
    const out: {
      id: string;
      d: string;
      conflict: boolean;
      selected: boolean;
    }[] = [];
    for (const seg of Object.values(routingGraph.segments)) {
      const preview = getOrthoDragPreview(seg.id);
      const pts =
        preview && preview.length >= 2
          ? preview
          : resolveSegmentPoints(seg, nodes, routingGraph, seg.id);
      if (!pts || pts.length < 2) continue;
      const networkEdgeId = segmentNetworkEdgeId(seg.id, edges);
      const bridges = findBridgeCrossings(seg.id, pts, edges, nodes, {
        networkEdgeId,
        resolvePoints: (e) => composeLogicalRoutePoints(e, nodes, routingGraph),
      });
      const d = pointsToSvgPathWithBridges(pts, bridges);
      if (!d) continue;
      out.push({
        id: seg.id,
        d,
        conflict: conflictSegs.has(seg.id),
        selected: selected.has(seg.id),
      });
    }
    return out;
  }, [
    edgeRoutingMode,
    routingGraph,
    nodes,
    edges,
    conflictSegs,
    previewVersion,
    selectionVersion,
  ]);

  if (paths.length === 0) return null;

  return (
    <ViewportPortal>
      <svg
        className="remodeller-shared-routing-overlay"
        width="1"
        height="1"
        style={{
          position: "absolute",
          overflow: "visible",
          pointerEvents: "none",
          left: 0,
          top: 0,
        }}
      >
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            className={[
              "react-flow__edge-path",
              "rf-shared-seg",
              p.conflict ? "rf-edge-conflict" : "",
              p.selected ? "rf-shared-seg-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            fill="none"
            stroke={
              p.conflict
                ? "var(--conflict-edge-stroke)"
                : p.selected
                  ? "var(--accent)"
                  : "#b1b1b7"
            }
            strokeWidth={p.selected ? 3.25 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </ViewportPortal>
  );
}

export const SharedRoutingOverlay = memo(SharedRoutingOverlayImpl);
SharedRoutingOverlay.displayName = "SharedRoutingOverlay";
