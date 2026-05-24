import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DestructiveConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[10020] bg-black/35"
        aria-label={t("close")}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="destructive-dialog-title"
        className="fixed left-1/2 top-1/2 z-[10021] w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl"
      >
        <h2
          id="destructive-dialog-title"
          className="text-sm font-semibold text-[var(--text)]"
        >
          {title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--bg)]"
            onClick={onCancel}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="rounded border border-red-500/50 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/25"
            onClick={onConfirm}
          >
            {confirmLabel ?? t("confirmDelete")}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
