import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";

/**
 * Invisible routing-only junction. Handle sits at the node origin so
 * segment endpoints match stored junction coordinates exactly.
 */
function RoutingJunctionNodeImpl(_props: NodeProps) {
  const handleStyle: React.CSSProperties = {
    width: 1,
    height: 1,
    minWidth: 1,
    minHeight: 1,
    left: 0,
    top: 0,
    opacity: 0,
    pointerEvents: "none",
    border: "none",
    background: "transparent",
    transform: "none",
  };
  return (
    <div
      style={{
        width: 1,
        height: 1,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="j"
        style={handleStyle}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="j"
        style={handleStyle}
      />
    </div>
  );
}

export const RoutingJunctionNode = memo(RoutingJunctionNodeImpl);
RoutingJunctionNode.displayName = "RoutingJunctionNode";
