import { MIN_SEG } from "./constants";
import { axisOf, dist } from "./geometry";
import { degreeOf, isPortVertex } from "./nets";
import type { RouteGraph } from "./types";

export type InvariantIssue = string;

export function collectInvariantIssues(graph: RouteGraph): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const vIds = new Set(graph.vertices.map((v) => v.id));
  const byId = new Map(graph.vertices.map((v) => [v.id, v]));

  for (const s of graph.segments) {
    if (!vIds.has(s.a) || !vIds.has(s.b)) {
      issues.push(`dangling segment ${s.id}`);
      continue;
    }
    const a = byId.get(s.a)!;
    const b = byId.get(s.b)!;
    const ax = axisOf(a, b);
    if (ax !== s.axis) issues.push(`axis mismatch ${s.id}`);
    if (dist(a, b) < MIN_SEG) issues.push(`zero-length ${s.id}`);
    if (!graph.nets.some((n) => n.id === s.netId)) {
      issues.push(`segment ${s.id} missing net`);
    }
  }

  for (const v of graph.vertices) {
    const deg = degreeOf(graph, v.id);
    if (!isPortVertex(v) && deg === 1) {
      issues.push(`degree-1 vertex ${v.id}`);
    }
    if (deg > 4) issues.push(`degree ${deg} at ${v.id}`);
    if (isPortVertex(v) && v.kind !== "port") {
      issues.push(`port kind ${v.id}`);
    }
    if (isPortVertex(v) && deg > 1) {
      issues.push(`port degree ${deg} at ${v.id}`);
    }
    if (!isPortVertex(v)) {
      if (deg === 3 && v.kind !== "3si") issues.push(`kind ${v.kind} deg3 ${v.id}`);
      if (deg === 4 && v.kind !== "4si") issues.push(`kind ${v.kind} deg4 ${v.id}`);
      if (deg === 2 && v.kind !== "corner") issues.push(`kind ${v.kind} deg2 ${v.id}`);
    }
  }

  return issues;
}

export function assertInvariants(graph: RouteGraph): void {
  const issues = collectInvariantIssues(graph);
  if (issues.length) {
    throw new Error(`RouteGraph invariants: ${issues.join("; ")}`);
  }
}

export function countByKind(graph: RouteGraph, kind: string): number {
  return graph.vertices.filter((v) => v.kind === kind).length;
}

export function countByAxis(graph: RouteGraph, axis: "h" | "v"): number {
  return graph.segments.filter((s) => s.axis === axis).length;
}
