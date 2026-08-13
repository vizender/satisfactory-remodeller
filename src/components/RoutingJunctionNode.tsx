import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";

const HANDLE = {
  width: 8,
  height: 8,
  minWidth: 8,
  minHeight: 8,
  opacity: 0,
  pointerEvents: "none" as const,
  border: "none",
  background: "transparent",
  /** Pin to node origin so segment endpoints match junction x/y. */
  left: 0,
  top: 0,
  transform: "none",
};

/**
 * Invisible routing-only junction. Unique source/target handle ids are required
 * by React Flow; without measured width + handles, segment edges never mount.
 */
function RoutingJunctionNodeImpl(_props: NodeProps) {
  return (
    <div
      className="routing-junction"
      style={{
        width: 8,
        height: 8,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <Handle type="source" position={Position.Right} id="js" style={HANDLE} />
      <Handle type="target" position={Position.Left} id="jt" style={HANDLE} />
    </div>
  );
}

export const RoutingJunctionNode = memo(RoutingJunctionNodeImpl);
RoutingJunctionNode.displayName = "RoutingJunctionNode";
