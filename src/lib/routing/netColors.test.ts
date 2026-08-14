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

  it("gives distinct colors to nets that do not cross", () => {
    const colors = colorNets(
      ["a", "b", "c"],
      new Map([
        ["a", new Set()],
        ["b", new Set()],
        ["c", new Set()],
      ]),
    );
    expect(colors.get("a")).toBe(NET_PALETTE[0]);
    expect(colors.get("b")).toBe(NET_PALETTE[1]);
    expect(colors.get("c")).toBe(NET_PALETTE[2]);
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

  it("keeps parallel nets distinct, and still distinct after they cross", () => {
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
    const before = assignNetColors(asGraph(w));
    expect(before.get("nA")).not.toBe(before.get("nB"));
    const v1 = addVertex(w, 80, 0);
    const v2 = addVertex(w, 80, 120);
    addSegment(w, v1.id, v2.id, "nB", "v");
    const colors = assignNetColors(asGraph(w));
    expect(colors.get("nA")).not.toBe(colors.get("nB"));
  });

  it("recolors a wrapped palette slot when those two nets cross", () => {
    const ids = Array.from({ length: NET_PALETTE_SIZE + 1 }, (_, i) => `n${i}`);
    const neighbors = new Map<string, Set<string>>();
    for (const id of ids) neighbors.set(id, new Set());
    neighbors.set("n0", new Set(["n15"]));
    neighbors.set("n15", new Set(["n0"]));
    const colors = colorNets(ids, neighbors);
    expect(colors.get("n0")).not.toBe(colors.get("n15"));
    expect(new Set(colors.values()).size).toBe(NET_PALETTE_SIZE);
  });

  it("recolors the other net when the first has no free color", () => {
    const ids = Array.from({ length: NET_PALETTE_SIZE + 1 }, (_, i) => `n${i}`);
    const neighbors = new Map<string, Set<string>>();
    const leaves = ids.slice(0, NET_PALETTE_SIZE);
    neighbors.set("n15", new Set(leaves));
    for (const id of leaves) neighbors.set(id, new Set(["n15"]));
    const colors = colorNets(ids, neighbors);
    expect(colors.get("n15")).not.toBe(colors.get("n0"));
    for (const id of leaves) {
      expect(colors.get("n15")).not.toBe(colors.get(id));
    }
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
    let sameColorCrossings = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (colors.get(ids[i]!) === colors.get(ids[j]!)) sameColorCrossings++;
      }
    }
    expect(sameColorCrossings).toBe(1);
  });
});
