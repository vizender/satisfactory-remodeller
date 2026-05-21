import { useLayoutEffect, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

const NATIVE_CONTEXT_ALLOW =
  'input, textarea, select, [contenteditable="true"], [data-allow-native-context]';

function allowsNativeContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(NATIVE_CONTEXT_ALLOW);
}

function isInsideRoot(root: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && root.contains(target);
}

/**
 * Bloque le menu contextuel natif Safari / WebKit sur une zone (canvas).
 * Listeners en capture sur document + preventDefault sur contextmenu et
 * mousedown (bouton 2). Ne pas stopPropagation : XYFlow doit encore recevoir l’événement.
 */
export function useSuppressNativeContextMenu(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const getRoot = () => containerRef.current;

    const shouldSuppress = (target: EventTarget | null): boolean => {
      const root = getRoot();
      if (!root || !isInsideRoot(root, target)) return false;
      if (allowsNativeContextMenu(target)) return false;
      return true;
    };

    const onContextMenu = (event: Event) => {
      if (!shouldSuppress(event.target)) return;
      event.preventDefault();
    };

    const onMouseDown = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      if (event.button !== 2) return;
      if (!shouldSuppress(event.target)) return;
      event.preventDefault();
    };

    const onAuxClick = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      if (event.button !== 2) return;
      if (!shouldSuppress(event.target)) return;
      event.preventDefault();
    };

    const opts: AddEventListenerOptions = { capture: true };

    document.addEventListener("contextmenu", onContextMenu, opts);
    document.addEventListener("mousedown", onMouseDown, opts);
    document.addEventListener("auxclick", onAuxClick, opts);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, opts);
      document.removeEventListener("mousedown", onMouseDown, opts);
      document.removeEventListener("auxclick", onAuxClick, opts);
    };
  });
}

/** Handler React sur le conteneur (complément WebKit, sans stopPropagation). */
export function handleSuppressNativeContextMenu(
  event: ReactMouseEvent,
  container: HTMLElement | null,
): void {
  if (!container || !isInsideRoot(container, event.target)) return;
  if (allowsNativeContextMenu(event.target)) return;
  event.preventDefault();
}
