import type { EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { OrthogonalEdge } from "@/components/edges/OrthogonalEdge";
import { WideHitBezierEdge } from "@/components/edges/WideHitBezierEdge";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";

/**
 * Chooses Bezier vs orthogonal rendering from the global canvas UI preference.
 */
function FlowEdgeImpl(props: EdgeProps) {
  const mode = useCanvasUiStore((s) => s.edgeRoutingMode);
  if (mode === "orthogonal") {
    return <OrthogonalEdge {...props} />;
  }
  return <WideHitBezierEdge {...props} />;
}

export const FlowEdge = memo(FlowEdgeImpl);
FlowEdge.displayName = "FlowEdge";
