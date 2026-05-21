import { useEffect, useState } from "react";
import {
  resolveItemIconUrl,
  resolveMachineIconUrl,
  type ItemIconHint,
} from "@/lib/iconUrls";

/**
 * Charge l’URL d’icône item à la demande (glob PNG lazy).
 */
export function useItemIconUrl(
  itemId: string,
  options?: { iconHint?: ItemIconHint; src?: string | null },
): string | null {
  const explicit = options?.src;
  const iconHint = options?.iconHint;
  const [url, setUrl] = useState<string | null>(explicit ?? null);

  useEffect(() => {
    if (explicit) {
      setUrl(explicit);
      return;
    }
    let cancelled = false;
    setUrl(null);
    resolveItemIconUrl(itemId, iconHint).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, explicit, iconHint]);

  return explicit ?? url;
}

/**
 * Charge l’URL d’icône machine à la demande (glob PNG lazy).
 */
export function useMachineIconUrl(
  classId: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    resolveMachineIconUrl(classId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  return url;
}
