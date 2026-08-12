import { useI18n } from "@/i18n/I18nProvider";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";

export function RigidPortSnapToggle() {
  const { t } = useI18n();
  const rigidPortSnap = useCanvasUiStore((s) => s.rigidPortSnap);
  const toggleRigidPortSnap = useCanvasUiStore((s) => s.toggleRigidPortSnap);

  return (
    <button
      type="button"
      aria-pressed={rigidPortSnap}
      title={t("snapToggleTitle")}
      className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
        rigidPortSnap
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
      }`}
      onClick={toggleRigidPortSnap}
    >
      {t("snapToggle")}
    </button>
  );
}
