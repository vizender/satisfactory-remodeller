import { expect, it } from "vitest";
import {
  buildRouteGraph,
  collectInvariantIssues,
  kinkSegment,
  type PortHandle,
} from "./index";
import { followGroupMovement } from "./groupDrag";
const ports: PortHandle[] = [
  { portId: "a", itemId: "iron", kind: "out", x: 0, y: 0 },
  { portId: "b", itemId: "iron", kind: "in", x: 600, y: 0 },
];
it("translates internal wire bends with both endpoints", () => {
  const base = buildRouteGraph(ports, [
    { id: "e", source: "a", target: "b", itemId: "iron" },
  ]);
  const g = kinkSegment(
    base,
    base.segments[0].id,
    { x: 300, y: 0 },
    { x: 300, y: 64 },
  );
  const moved = followGroupMovement(
    g,
    ports,
    ports.map((p) => ({ ...p, x: p.x + 64, y: p.y + 96 })),
  );
  expect(moved.vertices.map((v) => [v.id, v.x, v.y])).toEqual(
    g.vertices.map((v) => [v.id, v.x + 64, v.y + 96]),
  );
  expect(collectInvariantIssues(moved)).toEqual([]);
});
it("keeps the stationary endpoint attached when only one machine moves", () => {
  const g = buildRouteGraph(ports, [
    { id: "e", source: "a", target: "b", itemId: "iron" },
  ]);
  const moved = followGroupMovement(g, ports, [
    { ...ports[0], y: 96 },
    ports[1],
  ]);
  expect(moved.vertices.find((v) => v.portId === "a")?.y).toBe(96);
  expect(moved.vertices.find((v) => v.portId === "b")?.y).toBe(0);
  expect(collectInvariantIssues(moved)).toEqual([]);
});
it("moves an internal branch even when its shared net also leaves the group", () => {
  const before: PortHandle[] = [
    ...ports,
    { portId: "external", itemId: "iron", kind: "in", x: 1000, y: 400 },
  ];
  const g = buildRouteGraph(before, [
    { id: "e", source: "a", target: "b", itemId: "iron" },
    { id: "external-edge", source: "a", target: "external", itemId: "iron" },
  ]);
  const moved = followGroupMovement(
    g,
    before,
    before.map((p) =>
      p.portId === "external" ? p : { ...p, x: p.x + 64, y: p.y + 96 },
    ),
  );
  expect(moved.vertices.find((v) => v.portId === "external")).toMatchObject({
    x: 1000,
    y: 400,
  });
  expect(moved.vertices.find((v) => v.portId === "a")).toMatchObject({
    x: 64,
    y: 96,
  });
  expect(moved.vertices.find((v) => v.portId === "b")).toMatchObject({
    x: 664,
    y: 96,
  });
  expect(collectInvariantIssues(moved)).toEqual([]);
  const internal = g.vertices.filter((v) => !v.portId && v.y === 0);
  for (const v of internal)
    expect(moved.vertices.find((next) => next.id === v.id)).toMatchObject({
      x: v.x + 64,
      y: v.y + 96,
    });
});
