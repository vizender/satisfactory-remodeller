import type { EdgeProps } from "@xyflow/react";
import { memo } from "react";

/** Topology-only edge: solver still sees the link; geometry lives on the overlay. */
function HiddenTopologyEdgeImpl(_props: EdgeProps) {
  return null;
}

export const HiddenTopologyEdge = memo(HiddenTopologyEdgeImpl);
HiddenTopologyEdge.displayName = "HiddenTopologyEdge";
