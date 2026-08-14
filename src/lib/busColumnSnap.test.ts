import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  collectVerticalSegments,
  filterSegmentsToSameNetwork,
  mergeColinearVerticals,
  snapVerticalX,
  VERTICAL_SNAP_ENGAGE,
} from "@/lib/orthogonalEdgePath";
import {
  collectRoutingGraphVerticals,
  composeLogicalRoutePoints,
  rebuildRoutingGraph,
  segmentNetworkEdgeId,
} from "@/lib/routingGraph";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;
const FRAME_W = PORT_W + GUTTER + BODY_W + GUTTER + PORT_W;

function port(
  id: string,
  parentId: string,
  kind: "in" | "out",
  x: number,
  y: number,
): Node {
  return {
    id,
    type: "itemPort",
    parentId,
    position: { x, y },
    data: { kind, itemId: "IronIngot" },
  };
}

function frame(id: string, x: number, y: number): Node {
  return {
    id,
    type: "machineFrame",
    position: { x, y },
    data: {},
    style: { width: FRAME_W, height: 196 },
  };
}

function edge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    data: { itemId: "IronIngot" },
  };
}

function threeInputBus() {
  const nodes: Node[] = [
    frame("m1", 0, 0),
    port("out", "m1", "out", 96, 0),
    frame("m2", 400, 0),
    port("in1", "m2", "in", 0, 0),
    frame("m3", 400, 200),
    port("in2", "m3", "in", 0, 0),
    frame("m4", 400, 400),
    port("in3", "m4", "in", 0, 0),
  ];
  const { graph, edges } = rebuildRoutingGraph(nodes, [
    edge("e1", "out", "in1"),
    edge("e2", "out", "in2"),
    edge("e3", "out", "in3"),
  ]);
  return { nodes, graph, edges };
}

describe("snap onto a shared bus column", () => {
  it("filter by routing-segment id still finds the bus network", () => {
    const { nodes, graph, edges } = threeInputBus();
    const busId = Object.values(graph.segments).find(
      (s) => s.a.kind === "junction" && s.b.kind === "junction",
    )!.id;
    expect(segmentNetworkEdgeId(busId, edges)).toBeTruthy();
    const others = collectVerticalSegments(edges, nodes, busId, {
      sameNetworkAs: busId,
      resolvePoints: (ed) => composeLogicalRoutePoints(ed, nodes, graph),
    });
    expect(others.length).toBeGreaterThan(0);
  });

  it("graph rails merge split bus spans into one column", () => {
    const { nodes, graph, edges } = threeInputBus();
    const busId = Object.values(graph.segments).find(
      (s) => s.a.kind === "junction" && s.b.kind === "junction",
    )!.id;
    const rails = collectRoutingGraphVerticals(
      graph,
      nodes,
      edges,
      new Set([busId]),
    );
    const merged = mergeColinearVerticals(
      filterSegmentsToSameNetwork(busId, rails, edges),
    );
    expect(merged.some((s) => s.rail)).toBe(true);
    const col = merged.find((s) => s.rail)!;
    expect(col.y2 - col.y1).toBeGreaterThan(150);
  });

  it("a V overlapping the middle of the bus snaps onto the column", () => {
    const { nodes, graph, edges } = threeInputBus();
    const busId = Object.values(graph.segments).find(
      (s) => s.a.kind === "junction" && s.b.kind === "junction",
    )!.id;
    const others = mergeColinearVerticals(
      filterSegmentsToSameNetwork(
        busId,
        collectRoutingGraphVerticals(graph, nodes, edges, new Set([busId])),
        edges,
      ),
    );
    const bus = others.find((s) => s.rail)!;
    const midY = (bus.y1 + bus.y2) / 2;
    const proposed = bus.x - (VERTICAL_SNAP_ENGAGE - 8);
    const snapped = snapVerticalX(proposed, midY - 20, midY + 20, others, null);
    expect(snapped).toBe(bus.x);
  });

  it("a V past the bus extremity still snaps onto the column", () => {
    const { nodes, graph, edges } = threeInputBus();
    const busId = Object.values(graph.segments).find(
      (s) => s.a.kind === "junction" && s.b.kind === "junction",
    )!.id;
    const others = mergeColinearVerticals(
      filterSegmentsToSameNetwork(
        busId,
        collectRoutingGraphVerticals(graph, nodes, edges, new Set([busId])),
        edges,
      ),
    );
    const bus = others.find((s) => s.rail)!;
    const proposed = bus.x - (VERTICAL_SNAP_ENGAGE - 8);
    const snapped = snapVerticalX(
      proposed,
      bus.y1 - 80,
      bus.y1 - 40,
      others,
      null,
    );
    expect(snapped).toBe(bus.x);
  });

  it("does not snap a foreign-network vertical onto the bus", () => {
    const { nodes, graph, edges } = threeInputBus();
    const foreign: Edge[] = [
      ...edges,
      {
        id: "other",
        source: "qx",
        target: "qy",
        data: { itemId: "wire" },
      },
    ];
    const busId = Object.values(graph.segments).find(
      (s) => s.a.kind === "junction" && s.b.kind === "junction",
    )!.id;
    const others = mergeColinearVerticals(
      filterSegmentsToSameNetwork(
        "other",
        collectRoutingGraphVerticals(graph, nodes, foreign, new Set()),
        foreign,
      ),
    );
    expect(others.filter((s) => s.rail)).toHaveLength(0);
    void busId;
  });
});
