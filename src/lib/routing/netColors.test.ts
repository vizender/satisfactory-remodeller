import { describe, expect, it } from "vitest";
import {
  NET_PALETTE,
  NET_PALETTE_SIZE,
  assignNetColors,
  colorNets,
  crossingNetAdjacency,
} from "./netColors";
import { addSegment, addVertex, asGraph, toWorking } from "./working";
import { emptyRouteGraph } from "./types";
import { resetRouteIds } from "./ids";

describe("net colors", () => {
  it("has 15 distinct strokes and no solver-red hues", () => {
    expect(NET_PALETTE).toHaveLength(15);
    expect(new Set(NET_PALETTE).size).toBe(15);
    const banned = ["#dc2626", "#ef4444", "#f87171", "#f43f5e", "#e11d48"];
    for (const hex of NET_PALETTE) {
      expect(banned).not.toContain(hex.toLowerCase());
    }
  });

  it("gives crossing nets different colors", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    w.nets.set("nA", { id: "nA", itemId: "x", edgeIds: ["eA"] });
    w.nets.set("nB", { id: "nB", itemId: "y", edgeIds: ["eB"] });
    const a1 = addVertex(w, 0, 40);
    const a2 = addVertex(w, 200, 40);
    const b1 = addVertex(w, 80, 0);
    const b2 = addVertex(w, 80, 120);
    addSegment(w, a1.id, a2.id, "nA", "h");
    addSegment(w, b1.id, b2.id, "nB", "v");
    const g = asGraph(w);
    const adj = crossingNetAdjacency(g);
    expect(adj.get("nA")?.has("nB")).toBe(true);
    const colors = assignNetColors(g);
    expect(colors.get("nA")).not.toBe(colors.get("nB"));
  });

  it("recolors the later net when two same-color nets start crossing", () => {
    resetRouteIds(1);
    const w = toWorking(emptyRouteGraph());
    w.nets.set("nA", { id: "nA", itemId: "x", edgeIds: ["eA"] });
    w.nets.set("nB", { id: "nB", itemId: "y", edgeIds: ["eB"] });
    const a1 = addVertex(w, 0, 40);
    const a2 = addVertex(w, 200, 40);
    const b1 = addVertex(w, 0, 80);
    const b2 = addVertex(w, 200, 80);
    addSegment(w, a1.id, a2.id, "nA", "h");
    addSegment(w, b1.id, b2.id, "nB", "h");
    expect(assignNetColors(asGraph(w)).get("nA")).toBe(
      assignNetColors(asGraph(w)).get("nB"),
    );
    const v1 = addVertex(w, 80, 0);
    const v2 = addVertex(w, 80, 120);
    addSegment(w, v1.id, v2.id, "nB", "v");
    const colors = assignNetColors(asGraph(w));
    expect(colors.get("nA")).not.toBe(colors.get("nB"));
  });

  it("allows the same color when nets do not cross", () => {
    const colors = colorNets(
      ["a", "b"],
      new Map([
        ["a", new Set()],
        ["b", new Set()],
      ]),
    );
    expect(colors.get("a")).toBe(colors.get("b"));
    expect(colors.get("a")).toBe(NET_PALETTE[0]);
  });

  it("reuses a color when more than 15 nets all pairwise cross", () => {
    const ids = Array.from({ length: NET_PALETTE_SIZE + 1 }, (_, i) => `n${i}`);
    const neighbors = new Map<string, Set<string>>();
    for (const id of ids) {
      neighbors.set(id, new Set(ids.filter((o) => o !== id)));
    }
    const colors = colorNets(ids, neighbors);
    const used = new Set(colors.values());
    expect(used.size).toBe(NET_PALETTE_SIZE);
    expect(colors.get("n15")).toBeDefined();
  });
});
