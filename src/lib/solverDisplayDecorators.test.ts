import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { applySolverConflictToEdges } from "@/lib/solverDisplayDecorators";

describe("applySolverConflictToEdges", () => {
  it("marks conflict edges without raising z-index above kink handles", () => {
    const edges: Edge[] = [
      { id: "ok", source: "a", target: "b" },
      { id: "bad", source: "c", target: "d", className: "rf-ortho" },
    ];
    const next = applySolverConflictToEdges(edges, ["bad"]);
    expect(next[0]?.zIndex).toBeUndefined();
    expect(next[1]?.className).toContain("rf-edge-conflict");
    expect(next[1]?.zIndex).toBeUndefined();
  });
});
