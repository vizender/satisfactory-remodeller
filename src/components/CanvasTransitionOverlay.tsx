import { useI18n } from "@/i18n/I18nProvider";
import { useWorldStore } from "@/store/useWorldStore";

export function CanvasTransitionOverlay() {
  const { t } = useI18n();
  const isNavigating = useWorldStore((s) => s.isNavigating);
  const targetName = useWorldStore((s) => {
    const id = s.navigationTargetId;
    if (!id) return "";
    return s.canvasMap[id]?.name ?? "";
  });

  if (!isNavigating) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-[2px] transition-opacity duration-200"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg">
        <p className="text-sm font-medium text-[var(--text)]">
          {targetName ? t("factoryLoadingNamed", { name: targetName }) : t("factoryLoading")}
        </p>
      </div>
    </div>
  );
}
