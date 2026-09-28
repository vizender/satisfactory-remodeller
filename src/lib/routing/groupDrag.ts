import { followPortVertices } from "./machineDrag";
import { cloneRouteGraph, type PortHandle, type RouteGraph } from "./types";

/** Rigidly move internal wires; stretch wires that leave the moving group. */
export function followGroupMovement(
  snapshot: RouteGraph,
  before: PortHandle[],
  after: PortHandle[],
): RouteGraph {
  const start = new Map(before.map((p) => [p.portId, p]));
  const end = new Map(after.map((p) => [p.portId, p]));
  const graph = cloneRouteGraph(snapshot);
  const moved = new Set<string>();
  for (const net of graph.nets) {
    const ids = new Set(
      graph.segments
        .filter((s) => s.netId === net.id)
        .flatMap((s) => [s.a, s.b]),
    );
    const vertices = graph.vertices.filter((v) => ids.has(v.id));
    const ports = vertices.filter((v) => v.portId);
    const deltas = ports.map((v) => {
      const a = start.get(v.portId!);
      const b = end.get(v.portId!);
      return a && b ? { x: b.x - a.x, y: b.y - a.y } : null;
    });
    const moving = deltas.filter((d) => d && (d.x || d.y));
    const delta = moving[0];
    // Shared nets can also have stationary external branches. Move the internal
    // skeleton with the group, then let those external port stubs stretch.
    if (
      !delta ||
      moving.length < 2 ||
      !moving.every(
        (d) =>
          d &&
          Math.abs(d.x - delta.x) < 0.001 &&
          Math.abs(d.y - delta.y) < 0.001,
      )
    )
      continue;
    for (const v of vertices) {
      if (moved.has(v.id)) continue;
      v.x += delta.x;
      v.y += delta.y;
      moved.add(v.id);
    }
  }
  return followPortVertices(graph, after);
}
