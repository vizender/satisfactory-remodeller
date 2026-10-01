import type { CanvasRecord } from "@/types/canvas";
import type { BlueprintLibrary } from "@/types/blueprint";
import { buildFactoryNode } from "./buildFactoryGraph";
import { publishBlueprint } from "./blueprints";
import { captureCanvasSelection, cutCanvasSelection, pasteCanvasSelection } from "./canvasClipboard";
import { canAddNestedFactory, createChildCanvasRecord, nextFactoryId, nextFactoryLabel } from "./canvasTree";
import { reconcileFactoryHierarchy } from "./factoryHierarchy";

/** Move selected machines and containers into a new child canvas, dropping external wires. */
export function wrapCanvasSelection(
  canvases: Record<string, CanvasRecord>,
  library: BlueprintLibrary,
  canvasId: string,
  frameIds: ReadonlySet<string>,
  kind: "factory" | "blueprint",
  name?: string,
): { canvases: Record<string, CanvasRecord>; library: BlueprintLibrary; id: string } | null {
  const source = canvases[canvasId];
  if (!source || !canAddNestedFactory(canvases, canvasId)) return null;
  const frames = source.nodes.filter((n) =>
    frameIds.has(n.id) && (n.type === "machineFrame" || n.type === "containerFrame"),
  );
  if (!frames.length) return null;
  const selectedIds = new Set(frames.map((n) => n.id));
  const prepared = {
    ...canvases,
    [canvasId]: {
      ...source,
      nodes: source.nodes.map((n) => ({ ...n, selected: selectedIds.has(n.id) })),
      edges: source.edges.map((e) => ({ ...e, selected: false })),
    },
  };
  const clipboard = captureCanvasSelection(prepared, canvasId);
  if (!clipboard) return null;
  const id = nextFactoryId(canvases);
  const label = name?.trim() || (kind === "blueprint" ? "Blueprint" : nextFactoryLabel(canvases, canvasId).label);
  const minX = Math.min(...frames.map((n) => n.position.x));
  const minY = Math.min(...frames.map((n) => n.position.y));
  let next = cutCanvasSelection(prepared, canvasId);
  next[canvasId] = {
    ...next[canvasId],
    nodes: [...next[canvasId].nodes, { ...buildFactoryNode(id, { x: minX, y: minY }, label), selected: true }],
  };
  next[id] = {
    ...createChildCanvasRecord(id, label, canvasId),
    ...(kind === "blueprint" ? { kind, blueprintId: `bp-${crypto.randomUUID()}` } : {}),
  };
  next = pasteCanvasSelection(next, id, clipboard, { x: 64 - minX, y: 64 - minY });
  next[id] = { ...next[id], nodes: next[id].nodes.map((n) => ({ ...n, selected: false })) };
  const published = publishBlueprint(next[id], library);
  next[id] = published.canvas;
  return {
    id,
    canvases: reconcileFactoryHierarchy(next, published.library),
    library: published.library,
  };
}
