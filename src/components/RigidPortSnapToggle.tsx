import { useI18n } from "@/i18n/I18nProvider";
import { useCanvasUiStore } from "@/store/useCanvasUiStore";

export function RigidPortSnapToggle() {
  const { t } = useI18n();
  const machineGridSnap = useCanvasUiStore((s) => s.machineGridSnap);
  const toggleMachineGridSnap = useCanvasUiStore(
    (s) => s.toggleMachineGridSnap,
  );

  return (
    <button
      type="button"
      aria-pressed={machineGridSnap}
      title={t("snapToggleTitle")}
      className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
        machineGridSnap
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
      }`}
      onClick={toggleMachineGridSnap}
    >
      {t("snapToggle")}
    </button>
  );
}
