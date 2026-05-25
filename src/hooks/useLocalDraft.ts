import { useEffect, useRef, useState } from "react";
import {
  readLocalDraft,
  writeLocalDraft,
} from "@/lib/factoryDocument";
import { scrubTutorialFactoriesFromDocument } from "@/lib/tutorialWorld";
import { isTutorialCompleted } from "@/tutorial/tutorialStorage";
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
 * @returns `true` une fois l’hydratation initiale terminée.
 */
export function useLocalDraft(): boolean {
  const hydrated = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let draft = readLocalDraft();
    if (draft && isTutorialCompleted()) {
      draft = scrubTutorialFactoriesFromDocument(draft);
    }
    if (draft) {
      useWorldStore.getState().replaceWorldDocument(draft);
    }
    setReady(true);
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

  return ready;
}
