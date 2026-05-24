import {
  BaseEdge,
  getBezierPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import { memo } from "react";

/**
 * Même courbe que l’arête `default` (Bezier), mais la hitbox n’utilise pas le path XYFlow
 * (`strokeOpacity: 0` → souvent **aucun** hit test sur WebKit / Tauri).
 * Ici : trait largement étalé, `vector-effect: non-scaling-stroke` (px écran), opacité mini non nulle.
 */
/** Largeur hitbox écran (non-scaling stroke) ; 32 → ÷1.5 par rapport au besoin utilisateur. */
const HIT_STROKE_SCREEN_PX = 21;

function WideHitBezierEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Bottom,
    targetPosition = Position.Top,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    pathOptions,
  } = props;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: pathOptions?.curvature,
  });

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
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={0}
      />
      <path
        d={path}
        fill="none"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={HIT_STROKE_SCREEN_PX}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "stroke" }}
        className="react-flow__edge-hitpad"
      />
    </>
  );
}

export const WideHitBezierEdge = memo(WideHitBezierEdgeImpl);
WideHitBezierEdge.displayName = "WideHitBezierEdge";
