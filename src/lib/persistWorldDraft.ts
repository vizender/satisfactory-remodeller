import { writeLocalDraft } from "@/lib/factoryDocument";
import { useWorldStore } from "@/store/useWorldStore";

/** Enregistre immédiatement le plan monde dans le stockage local. */
export function flushAndPersistWorldDraft(): void {
  useWorldStore.getState().flushActiveCanvas();
  writeLocalDraft(useWorldStore.getState().toWorldDocument());
}
