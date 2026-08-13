import { describe, expect, it } from "vitest";
import {
  assembleOpenPolyline,
  beginMidHandleKink,
  isDetourWrapRail,
  moveCorner2D,
  moveCorner2DOpen,
  moveSegment,
  moveSegmentOpen,
} from "@/lib/orthogonalEdgePath";

describe("orthogonal kink placement", () => {
  it("mid-handle kink on a vertical keeps the elbow near the pointer Y", () => {
    const points = [
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 250 },
      { x: 300, y: 250 },
    ];
    const at = { x: 260, y: 160 };
    const { points: kinked, cornerIndex } = beginMidHandleKink(points, 1, at);
    expect(cornerIndex).toBeGreaterThan(0);
    const elbow = kinked[cornerIndex]!;
    expect(Math.abs(elbow.y - 160)).toBeLessThan(20);
    expect(Math.abs(elbow.x - 200)).toBeGreaterThan(10);
  });

  it("moveCorner2D on a vertical bus (same endpoint X) follows pointer X", () => {
    // Shared routing bus: both ends share X
    const points = [
      { x: 220, y: 50 },
      { x: 260, y: 50 },
      { x: 260, y: 150 },
      { x: 220, y: 150 },
    ];
    const next = moveCorner2D(points, 1, 300, 50);
    expect(next[1]!.x).toBeGreaterThan(250);
  });

  it("dragging a 2-point segment kinks at the pointer, not the extremity", () => {
    const start = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ];
    const result = moveSegment(
      start,
      0,
      { x: 200, y: 160 },
      start,
      { x: 200, y: 100 },
    );
    expect(result.points.length).toBeGreaterThan(2);
    // The free horizontal should sit near the pointer Y, not only at start
    const ys = result.points.map((p) => p.y);
    expect(ys.some((y) => Math.abs(y - 160) < 24)).toBe(true);
    // And there should be a vertex near pointer X (not only near an endpoint)
    const xs = result.points.map((p) => p.x);
    expect(xs.some((x) => Math.abs(x - 200) < 24)).toBe(true);
  });

  it("open stub kink pins the port end (input: pin=end)", () => {
    const stub = [
      { x: 220, y: 100 }, // junction
      { x: 400, y: 100 }, // port
    ];
    const { points: kinked } = beginMidHandleKink(
      stub,
      0,
      { x: 300, y: 160 },
      "end",
    );
    const start = kinked[0]!;
    const end = kinked[kinked.length - 1]!;
    expect(start).toEqual({ x: 220, y: 100 });
    expect(end).toEqual({ x: 400, y: 100 });
    expect(kinked.length).toBeGreaterThan(2);
    const ys = new Set(kinked.map((p) => p.y));
    expect(ys.size).toBeGreaterThan(1);
  });

  it("open stub kink pins the port start (output: pin=start)", () => {
    const stub = [
      { x: 100, y: 100 }, // port
      { x: 220, y: 100 }, // junction
    ];
    const { points: kinked } = beginMidHandleKink(
      stub,
      0,
      { x: 160, y: 160 },
      "start",
    );
    expect(kinked[0]).toEqual({ x: 100, y: 100 });
    expect(kinked[kinked.length - 1]).toEqual({ x: 220, y: 100 });
    expect(kinked.length).toBeGreaterThan(2);
  });

  it("moveCorner2DOpen keeps endpoints fixed on a stub kink", () => {
    const points = [
      { x: 100, y: 100 },
      { x: 160, y: 100 },
      { x: 160, y: 160 },
      { x: 220, y: 160 },
      { x: 220, y: 100 },
    ];
    const next = moveCorner2DOpen(points, 2, 180, 200);
    expect(next[0]).toEqual({ x: 100, y: 100 });
    expect(next[next.length - 1]).toEqual({ x: 220, y: 100 });
  });

  it("moveSegmentOpen translateStraight moves a vertical rail without U-bend", () => {
    const start = [
      { x: 220, y: 50 },
      { x: 220, y: 250 },
    ];
    const result = moveSegmentOpen(
      0,
      { x: 280, y: 150 },
      start,
      { x: 220, y: 150 },
      { translateStraight: true },
    );
    expect(result.points).toHaveLength(2);
    expect(result.points[0]!.x).toBeGreaterThan(220);
    expect(result.points[0]!.x).toBe(result.points[1]!.x);
  });

  it("moveSegmentOpen offsets a straight vertical with a U-bend (endpoints fixed)", () => {
    const start = [
      { x: 220, y: 50 },
      { x: 220, y: 250 },
    ];
    const result = moveSegmentOpen(
      0,
      { x: 280, y: 150 },
      start,
      { x: 220, y: 150 },
    );
    expect(result.points[0]).toEqual({ x: 220, y: 50 });
    expect(result.points[result.points.length - 1]).toEqual({
      x: 220,
      y: 250,
    });
    expect(result.points.length).toBeGreaterThan(2);
    expect(result.points.some((p) => p.x > 220)).toBe(true);
  });

  it("moveSegmentOpen frees detour wrap-rail Y when junction is off the port row", () => {
    // Input detour: junction at wrapY, leave column, port at portY
    const start = [
      { x: 300, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 80 },
      { x: 140, y: 80 },
    ];
    const result = moveSegmentOpen(
      0,
      { x: 200, y: 240 },
      start,
      { x: 200, y: 200 },
      { pin: "end" },
    );
    expect(result.points[0]!.y).toBe(240);
    expect(result.points[1]!.y).toBe(240);
    // Port end stays put
    expect(result.points[result.points.length - 1]).toEqual({
      x: 140,
      y: 80,
    });
  });

  it("beginMidHandleKink refuses to invent a kink on a detour wrap rail", () => {
    const start = [
      { x: 300, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 80 },
      { x: 140, y: 80 },
    ];
    expect(isDetourWrapRail(start, 0, "end")).toBe(true);
    const { cornerIndex, points } = beginMidHandleKink(
      start,
      0,
      { x: 200, y: 240 },
      "end",
    );
    expect(cornerIndex).toBe(-1);
    expect(points[0]!.y).toBe(200);
    expect(points[1]!.y).toBe(200);
  });

  it("output detour wrap rail is the last free horizontal", () => {
    const start = [
      { x: 140, y: 80 },
      { x: 100, y: 80 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
    ];
    expect(isDetourWrapRail(start, 2, "start")).toBe(true);
    const result = moveSegmentOpen(
      2,
      { x: 200, y: 260 },
      start,
      { x: 200, y: 200 },
      { pin: "start" },
    );
    expect(result.points[2]!.y).toBe(260);
    expect(result.points[3]!.y).toBe(260);
    expect(result.points[0]).toEqual({ x: 140, y: 80 });
  });

  it("moveSegmentOpen soft-collapses a free H onto a sibling H (kink merge)", () => {
    // U-bend: free H at y=160, stub Hs at y=100 — drag free H within snap range
    const start = [
      { x: 100, y: 100 },
      { x: 140, y: 100 },
      { x: 140, y: 160 },
      { x: 220, y: 160 },
      { x: 220, y: 100 },
      { x: 300, y: 100 },
    ];
    const result = moveSegmentOpen(
      2,
      { x: 180, y: 130 },
      start,
      { x: 180, y: 160 },
      { pin: "both" },
    );
    // Within engage of y=100 → collapse toward stub row
    const freeYs = result.points.map((p) => p.y);
    expect(freeYs.every((y) => Math.abs(y - 100) < 1)).toBe(true);
  });

  it("assembleOpenPolyline keeps around-machine leave columns outside the stub span", () => {
    // Junction at bus X, port to the right — leave column sits left of the bus
    const start = { x: 280, y: 100 };
    const end = { x: 400, y: 100 };
    const pts = assembleOpenPolyline(
      start,
      [
        { x: 280, y: 160 }, // down the bus
        { x: 200, y: 160 }, // leave column (outside [280,400])
        { x: 200, y: 100 }, // up to port height
      ],
      end,
    );
    expect(pts[0]).toEqual(start);
    expect(pts[pts.length - 1]).toEqual(end);
    expect(pts.some((p) => Math.abs(p.x - 200) < 1 && Math.abs(p.y - 160) < 1)).toBe(
      true,
    );
    // On-axis overshoot still clamped
    const onAxis = assembleOpenPolyline(
      start,
      [{ x: 200, y: 100 }],
      end,
    );
    expect(onAxis.every((p) => p.x >= 280 - 0.51)).toBe(true);
  });
});
