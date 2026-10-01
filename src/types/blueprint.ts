import type { CanvasRecord } from "./canvas";

export interface BlueprintDefinition {
  id: string;
  name: string;
  revision: number;
  canvas: CanvasRecord;
  fingerprint: string;
}
export type BlueprintLibrary = Record<string, BlueprintDefinition>;
export interface BlueprintExport {
  exportKind: "blueprint";
  schemaVersion: 1;
  name: string;
  canvas: CanvasRecord;
}
