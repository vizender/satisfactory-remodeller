import type {
  BlueprintDefinition,
  BlueprintExport,
  BlueprintLibrary,
} from "@/types/blueprint";
import type { CanvasRecord } from "@/types/canvas";
import { repairFactoryDocumentV2 } from "./repairDocument";

import { blueprintFingerprint } from "./blueprintFingerprint";
export { blueprintFingerprint } from "./blueprintFingerprint";

/** A factory subtree carries its blueprint instances even without a separate library. */
export function recoverBlueprintLibrary(
  canvases: Record<string, CanvasRecord>,
  library: BlueprintLibrary,
): BlueprintLibrary {
  const recovered = { ...library };
  for (const canvas of Object.values(canvases)) {
    const id = canvas.blueprintId;
    if (
      !id ||
      library[id] ||
      (recovered[id]?.revision ?? 0) >= (canvas.blueprintRevision ?? 1)
    )
      continue;
    recovered[id] = {
      id,
      name: canvas.name,
      revision: canvas.blueprintRevision ?? 1,
      fingerprint: blueprintFingerprint(canvas),
      canvas: structuredClone(canvas),
    };
  }
  return recovered;
}
export function publishBlueprint(
  canvas: CanvasRecord,
  library: BlueprintLibrary,
): { canvas: CanvasRecord; library: BlueprintLibrary } {
  if (!canvas.blueprintId) return { canvas, library };
  const fingerprint = blueprintFingerprint(canvas);
  // An untouched older instance must never overwrite the latest library version.
  if (fingerprint === canvas.blueprintFingerprint) return { canvas, library };
  const revision = (library[canvas.blueprintId]?.revision ?? 0) + 1;
  const updated = {
    ...canvas,
    blueprintRevision: revision,
    blueprintFingerprint: fingerprint,
  };
  const definition: BlueprintDefinition = {
    id: canvas.blueprintId,
    name: canvas.name,
    revision,
    fingerprint,
    canvas: structuredClone(updated),
  };
  return {
    canvas: updated,
    library: { ...library, [definition.id]: definition },
  };
}
export function exportBlueprint(
  definition: BlueprintDefinition,
): BlueprintExport {
  return {
    exportKind: "blueprint",
    schemaVersion: 1,
    name: definition.name,
    canvas: structuredClone(definition.canvas),
  };
}
export function parseBlueprint(text: string): BlueprintDefinition {
  const value = JSON.parse(text) as BlueprintExport;
  if (
    value?.exportKind !== "blueprint" ||
    value.schemaVersion !== 1 ||
    !value.canvas ||
    !Array.isArray(value.canvas.nodes) ||
    typeof value.name !== "string"
  )
    throw new Error("Invalid blueprint JSON");
  if (
    !Array.isArray(value.canvas.edges) ||
    !value.canvas.nodes.every(
      (n) =>
        n &&
        typeof n.id === "string" &&
        n.data &&
        n.position &&
        Number.isFinite(n.position.x) &&
        Number.isFinite(n.position.y),
    )
  )
    throw new Error("Invalid blueprint nodes");
  if (value.canvas.nodes.some((n) => n?.type === "factoryFrame"))
    throw new Error("Blueprints cannot contain factories or blueprints");
  const repaired = repairFactoryDocumentV2({
    schemaVersion: 2,
    rootCanvasId: "world",
    canvases: { world: { ...value.canvas, id: "world" } },
    meta: { updatedAt: "" },
  }).canvases.world;
  const id = `bp-${crypto.randomUUID()}`;
  const canvas: CanvasRecord = {
    ...repaired,
    name: value.name,
    kind: "blueprint",
    blueprintId: id,
    blueprintRevision: 1,
  };
  const fingerprint = blueprintFingerprint(canvas);
  canvas.blueprintFingerprint = fingerprint;
  return { id, name: value.name, revision: 1, fingerprint, canvas };
}
