import { resetRouteIds } from "./ids";
import { buildRouteGraph } from "./layout";
import type { PortHandle, TopologyEdge } from "./types";

const ITEM = "Desc_IronIngot_C";

export function p(
  portId: string,
  x: number,
  y: number,
  kind: "in" | "out",
  itemId = ITEM,
): PortHandle {
  return { portId, x, y, kind, itemId };
}

export function e(
  id: string,
  source: string,
  target: string,
  itemId = ITEM,
): TopologyEdge {
  return { id, source, target, itemId };
}

export type SceneFixture = {
  id: number;
  name: string;
  ports: PortHandle[];
  edges: TopologyEdge[];
};

/** 1. 1-to-1 forward, aligned Y (single H) */
export function scene1(): SceneFixture {
  return {
    id: 1,
    name: "1-to-1 forward aligned",
    ports: [p("s", 0, 100, "out"), p("t", 400, 100, "in")],
    edges: [e("e1", "s", "t")],
  };
}

/** 2. 1-to-1 forward, offset Y (H+V+H) */
export function scene2(): SceneFixture {
  return {
    id: 2,
    name: "1-to-1 forward offset",
    ports: [p("s", 0, 40, "out"), p("t", 400, 200, "in")],
    edges: [e("e1", "s", "t")],
  };
}

/** 3. 1-to-1 reverse, offset Y (5-seg wrap around the left machine) */
export function scene3(): SceneFixture {
  return {
    id: 3,
    name: "1-to-1 reverse offset",
    ports: [p("s", 400, 40, "out"), p("t", 0, 200, "in")],
    edges: [e("e1", "s", "t")],
  };
}

/** 4. 1-to-1 reverse, aligned Y (U / 5 segments) */
export function scene4(): SceneFixture {
  return {
    id: 4,
    name: "1-to-1 reverse aligned",
    ports: [p("s", 400, 100, "out"), p("t", 0, 100, "in")],
    edges: [e("e1", "s", "t")],
  };
}

/** 5. 1-to-2 (one source stub, one 3SI) */
export function scene5(): SceneFixture {
  return {
    id: 5,
    name: "1-to-2",
    ports: [
      p("s", 0, 100, "out"),
      p("t1", 400, 40, "in"),
      p("t2", 400, 200, "in"),
    ],
    edges: [e("e1", "s", "t1"), e("e2", "s", "t2")],
  };
}

/** 6. 1-to-3 */
export function scene6(): SceneFixture {
  return {
    id: 6,
    name: "1-to-3",
    ports: [
      p("s", 0, 120, "out"),
      p("t1", 420, 20, "in"),
      p("t2", 420, 140, "in"),
      p("t3", 420, 240, "in"),
    ],
    edges: [e("e1", "s", "t1"), e("e2", "s", "t2"), e("e3", "s", "t3")],
  };
}

/** 7. 2-to-1 */
export function scene7(): SceneFixture {
  return {
    id: 7,
    name: "2-to-1",
    ports: [
      p("s1", 0, 40, "out"),
      p("s2", 0, 200, "out"),
      p("t", 400, 120, "in"),
    ],
    edges: [e("e1", "s1", "t"), e("e2", "s2", "t")],
  };
}

/** 8. 2-to-2 bus (3SIs on a vertical bus, not a 4SI) */
export function scene8(): SceneFixture {
  return {
    id: 8,
    name: "2-to-2 bus",
    ports: [
      p("s1", 0, 40, "out"),
      p("s2", 0, 200, "out"),
      p("t1", 420, 80, "in"),
      p("t2", 420, 240, "in"),
    ],
    edges: [
      e("e1", "s1", "t1"),
      e("e2", "s1", "t2"),
      e("e3", "s2", "t1"),
      e("e4", "s2", "t2"),
    ],
  };
}

/** 9. Two independent nets that cross */
export function scene9(): SceneFixture {
  return {
    id: 9,
    name: "two nets cross",
    ports: [
      p("sA", 0, 100, "out"),
      p("tA", 400, 100, "in"),
      p("sB", 40, 20, "out"),
      p("tB", 360, 200, "in"),
    ],
    edges: [e("eA", "sA", "tA"), e("eB", "sB", "tB")],
  };
}

/** 10. Mixed: reverse 1-to-1 + 1-to-N + a crossing foreign net */
export function scene10(): SceneFixture {
  return {
    id: 10,
    name: "mixed board",
    ports: [
      p("rS", 360, 40, "out"),
      p("rT", 0, 40, "in"),
      p("s", 0, 160, "out"),
      p("t1", 400, 120, "in"),
      p("t2", 400, 240, "in"),
      p("cS", 80, 80, "out", "Desc_IronPlate_C"),
      p("cT", 320, 280, "in", "Desc_IronPlate_C"),
    ],
    edges: [
      e("er", "rS", "rT"),
      e("e1", "s", "t1"),
      e("e2", "s", "t2"),
      e("ec", "cS", "cT", "Desc_IronPlate_C"),
    ],
  };
}

/** 11. Empty playground */
export function scene11(): SceneFixture {
  return {
    id: 11,
    name: "empty playground",
    ports: [],
    edges: [],
  };
}

export const ALL_SCENES: SceneFixture[] = [
  scene1(),
  scene2(),
  scene3(),
  scene4(),
  scene5(),
  scene6(),
  scene7(),
  scene8(),
  scene9(),
  scene10(),
  scene11(),
];

export function graphFor(scene: SceneFixture) {
  resetRouteIds(1);
  return buildRouteGraph(scene.ports, scene.edges);
}
