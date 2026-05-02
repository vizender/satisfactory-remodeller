import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";

type Props = {
  x: number;
  y: number;
  onClose: () => void;
  onBranch?: () => void;
  onDelete?: () => void;
};

export function EdgeContextMenu({ x, y, onClose, onBranch, onDelete }: Props) {
  const { ref: menuRef, left, top } = useClampedFixedPosition({ x, y }, true);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[9998] cursor-default bg-transparent"
        aria-label="Fermer le menu"
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
          Brancher (autre destination)
        </button>
        <p className="px-3 pb-2 text-[10px] leading-snug text-[var(--muted)]">
          Plusieurs liaisons depuis une même sortie sont possibles pour le même
          item.
        </p>
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
          Supprimer le lien
        </button>
      </div>
    </>
  );
}
