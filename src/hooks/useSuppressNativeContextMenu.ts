import { useEffect, type RefObject } from "react";

const NATIVE_CONTEXT_ALLOW =
  'input, textarea, select, [contenteditable="true"], [data-allow-native-context]';

function allowsNativeContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(NATIVE_CONTEXT_ALLOW);
}

/**
 * Bloque le menu contextuel natif (Safari macOS, Chrome) sur la zone canvas.
 * Utilise la phase capture pour que preventDefault s’applique avant le navigateur.
 * Ne stoppe pas la propagation : les handlers XYFlow (bubble) ouvrent toujours les menus app.
 */
export function useSuppressNativeContextMenu(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onContextMenu = (event: Event) => {
      if (allowsNativeContextMenu(event.target)) return;
      event.preventDefault();
    };

    root.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => {
      root.removeEventListener("contextmenu", onContextMenu, { capture: true });
    };
  });
}
