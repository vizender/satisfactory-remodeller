import { useLayoutEffect, useRef, useState } from "react";
import { clampFixedPanelToViewport } from "@/lib/viewportClamp";

/**
 * Mesure un élément `fixed` et recalcule left/top pour éviter le débordement viewport.
 */
export function useClampedFixedPosition(
  anchorScreen: { x: number; y: number },
  active: boolean,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({
    x: anchorScreen.x,
    y: anchorScreen.y,
  }));

  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      const r = el.getBoundingClientRect();
      const next = clampFixedPanelToViewport(
        { width: r.width, height: r.height },
        anchorScreen,
      );
      setPos(next);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [active, anchorScreen.x, anchorScreen.y]);

  return { ref, left: pos.x, top: pos.y };
}
