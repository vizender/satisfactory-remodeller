import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  x: number;
  y: number;
  onClose: () => void;
  onBranch?: () => void;
  onDelete?: () => void;
  onResetRoute?: () => void;
  showResetRoute?: boolean;
  onAddKink?: () => void;
  showAddKink?: boolean;
  onRemoveKink?: () => void;
  showRemoveKink?: boolean;
};

export function EdgeContextMenu({
  x,
  y,
  onClose,
  onBranch,
  onDelete,
  onResetRoute,
  showResetRoute,
  onAddKink,
  showAddKink,
  onRemoveKink,
  showRemoveKink,
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
        className="fixed z-[9999] min-w-[220px] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
        style={{ left, top }}
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
          onClick={() => {
            onBranch?.();
            onClose();
          }}
        >
          {t("branchEdge")}
        </button>
        <p className="px-3 pb-2 text-[10px] leading-snug text-[var(--muted)]">
          {t("branchEdgeHelp")}
        </p>
        {showAddKink ? (
          <>
            <hr className="border-[var(--border)]" />
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
              onClick={() => {
                onAddKink?.();
                onClose();
              }}
            >
              {t("addEdgeKink")}
            </button>
          </>
        ) : null}
        {showRemoveKink ? (
          <>
            <hr className="border-[var(--border)]" />
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
              onClick={() => {
                onRemoveKink?.();
                onClose();
              }}
            >
              {t("removeEdgeKink")}
            </button>
          </>
        ) : null}
        {showResetRoute ? (
          <>
            <hr className="border-[var(--border)]" />
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
              onClick={() => {
                onResetRoute?.();
                onClose();
              }}
            >
              {t("resetEdgeRoute")}
            </button>
          </>
        ) : null}
        <hr className="border-[var(--border)]" />
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-sm text-red-400/95 hover:bg-[var(--bg)]"
          onClick={() => {
            onDelete?.();
            onClose();
          }}
        >
          {t("deleteEdge")}
        </button>
      </div>
    </>
  );
}
