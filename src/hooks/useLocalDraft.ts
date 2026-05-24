import { useEffect, useRef } from "react";
import { readLocalDraft, writeLocalDraft } from "@/lib/factoryDocument";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useWorldStore } from "@/store/useWorldStore";

const SAVE_DEBOUNCE_MS = 1500;

function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): T & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: Parameters<T>) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (t !== undefined) clearTimeout(t);
  };
  return wrapped;
}

/**
 * Restaure le brouillon local au montage et enregistre les changements (debounced).
 */
export function useLocalDraft(): void {
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const draft = readLocalDraft();
    if (draft) {
      useWorldStore.getState().replaceWorldDocument(draft);
    }
  }, []);

  useEffect(() => {
    const save = debounce(() => {
      useWorldStore.getState().flushActiveCanvas();
      writeLocalDraft(useWorldStore.getState().toWorldDocument());
    }, SAVE_DEBOUNCE_MS);

    const unsubDoc = useDocumentStore.subscribe(save);
    return () => {
      save.cancel();
      unsubDoc();
    };
  }, []);
}
