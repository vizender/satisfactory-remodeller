import { useEffect } from "react";
import { createCanvasHistory } from "@/lib/canvasHistory";

export function useCanvasHistory(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const history = createCanvasHistory();
    const begin = () => history.beginGesture();
    const end = () => history.endGesture();
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        !["z", "y"].includes(key)
      )
        return;
      const target = event.target;
      // Text fields retain their native undo stack while being edited.
      if (target instanceof HTMLElement) {
        const field = target.closest("input, textarea");
        if (
          target.isContentEditable ||
          field instanceof HTMLTextAreaElement ||
          (field instanceof HTMLInputElement &&
            ![
              "checkbox",
              "radio",
              "range",
              "button",
              "submit",
              "reset",
            ].includes(field.type))
        )
          return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("pointerdown", begin, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", end);
    window.addEventListener("keydown", keydown);
    return () => {
      history.dispose();
      window.removeEventListener("pointerdown", begin, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", end);
      window.removeEventListener("keydown", keydown);
    };
  }, [enabled]);
}
