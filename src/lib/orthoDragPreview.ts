import type { OrthoPoint } from "@/types/edgeData";

type Listener = () => void;

/** Live orthogonal geometry while an edge is being kink/segment-dragged. */
const previewByEdge = new Map<string, OrthoPoint[]>();
const listeners = new Set<Listener>();
let version = 0;

function notify() {
  version += 1;
  for (const l of listeners) l();
}

export function setOrthoDragPreview(
  edgeId: string,
  points: OrthoPoint[] | null,
): void {
  if (points && points.length > 0) {
    previewByEdge.set(
      edgeId,
      points.map((p) => ({ x: p.x, y: p.y })),
    );
  } else if (!previewByEdge.has(edgeId)) {
    return;
  } else {
    previewByEdge.delete(edgeId);
  }
  notify();
}

export function getOrthoDragPreview(edgeId: string): OrthoPoint[] | undefined {
  return previewByEdge.get(edgeId);
}

export function clearOrthoDragPreview(edgeId: string): void {
  if (!previewByEdge.has(edgeId)) return;
  previewByEdge.delete(edgeId);
  notify();
}

export function subscribeOrthoDragPreview(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getOrthoDragPreviewVersion(): number {
  return version;
}
