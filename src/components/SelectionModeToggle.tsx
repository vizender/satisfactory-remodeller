import { useCanvasUiStore } from "@/store/useCanvasUiStore";
import { useI18n } from "@/i18n/I18nProvider";

export function SelectionModeToggle() {
  const { t } = useI18n();
  const mode = useCanvasUiStore((s) => s.selectionMode);
  const toggle = useCanvasUiStore((s) => s.toggleSelectionMode);
  const partial = mode === "partial";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(partial ? "selectionPartial" : "selectionFull")}
      title={t(partial ? "selectionPartialTitle" : "selectionFullTitle")}
      className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:border-[var(--accent)]/40"
    >
      {t(partial ? "selectionPartial" : "selectionFull")}
    </button>
  );
}
