import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";
import { useI18n } from "@/i18n/I18nProvider";
import type { ContainerVariant } from "@/types/graph";

type Props = {
  x: number;
  y: number;
  containerLabel: string;
  variant: ContainerVariant;
  outputEnabled: boolean;
  onOutputEnabledChange: (v: boolean) => void;
  onVariantChange: (v: ContainerVariant) => void;
  onClose: () => void;
  onClearForced: () => void;
  onDeleteContainer: () => void;
};

export function ContainerContextMenu({
  x,
  y,
  containerLabel,
  variant,
  outputEnabled,
  onOutputEnabledChange,
  onVariantChange,
  onClose,
  onClearForced,
  onDeleteContainer,
}: Props) {
  const { t } = useI18n();
  const { ref: menuRef, left, top } = useClampedFixedPosition({ x, y }, true);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[9998] cursor-default bg-transparent"
        aria-label={t("closeMenu")}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[9999] min-w-[260px] max-w-[min(90vw,320px)] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
        style={{ left, top }}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="border-b border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted)]">
          {containerLabel}
        </p>
        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--bg)]">
          <input
            type="checkbox"
            checked={outputEnabled}
            onChange={(e) => onOutputEnabledChange(e.target.checked)}
          />
          {t("containerOutputEnabled")}
        </label>
        <div className="border-b border-[var(--border)] px-3 py-2">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            {t("containerVariant")}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className={`rounded px-2 py-1.5 text-left text-xs ${
                variant === "standard"
                  ? "bg-[var(--accent)]/15 font-medium text-[var(--text)]"
                  : "text-[var(--muted)] hover:bg-[var(--bg)]"
              }`}
              onClick={() => onVariantChange("standard")}
            >
              {t("containerStandard")}
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1.5 text-left text-xs ${
                variant === "industrial"
                  ? "bg-[var(--accent)]/15 font-medium text-[var(--text)]"
                  : "text-[var(--muted)] hover:bg-[var(--bg)]"
              }`}
              onClick={() => onVariantChange("industrial")}
            >
              {t("containerIndustrial")}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--bg)]"
          onClick={() => {
            onClearForced();
            onClose();
          }}
        >
          {t("clearForcedRates")}
        </button>
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-[var(--bg)]"
          onClick={() => {
            onDeleteContainer();
            onClose();
          }}
        >
          {t("deleteContainer")}
        </button>
      </div>
    </>
  );
}
