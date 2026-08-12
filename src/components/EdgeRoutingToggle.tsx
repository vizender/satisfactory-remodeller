import { useI18n } from "@/i18n/I18nProvider";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";

export function EdgeRoutingToggle() {
  const { t } = useI18n();
  const edgeRoutingMode = useCanvasUiStore((s) => s.edgeRoutingMode);
  const toggleEdgeRoutingMode = useCanvasUiStore((s) => s.toggleEdgeRoutingMode);
  const orthogonal = edgeRoutingMode === "orthogonal";

  return (
    <button
      type="button"
      aria-pressed={orthogonal}
      title={t("edgeRoutingToggleTitle")}
      className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
        orthogonal
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
      }`}
      onClick={toggleEdgeRoutingMode}
    >
      {orthogonal ? t("edgeRoutingStraight") : t("edgeRoutingCurved")}
    </button>
  );
}
