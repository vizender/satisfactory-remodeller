import { createPortal } from "react-dom";
import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function FactoryContextMenu({
  x,
  y,
  label,
  onClose,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const { ref, left, top } = useClampedFixedPosition({ x, y }, true);

  const item =
    "block w-full rounded px-2.5 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg)]";

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[10000] cursor-default"
        aria-label={t("close")}
        onClick={onClose}
      />
      <div
        ref={ref}
        role="menu"
        className="fixed z-[10001] min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
        style={{ left, top }}
      >
        <div className="border-b border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--muted)]">
          {label}
        </div>
        <button type="button" className={item} onClick={onOpen}>
          {t("factoryOpen")}
        </button>
        <button type="button" className={item} onClick={onRename}>
          {t("factoryRename")}
        </button>
        <button type="button" className={item} onClick={onDuplicate}>
          {t("factoryDuplicate")}
        </button>
        <button
          type="button"
          className={`${item} text-red-300 hover:bg-red-500/10`}
          onClick={onDelete}
        >
          {t("factoryDelete")}
        </button>
      </div>
    </>,
    document.body,
  );
}
