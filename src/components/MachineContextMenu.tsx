import { useEffect, useState } from "react";
import {
  CLOCK_DEFAULT,
  CLOCK_MAX,
  CLOCK_MIN,
  clampClockPercent,
} from "@/lib/clockSpeed";
import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";

type Props = {
  x: number;
  y: number;
  machineLabel: string;
  clockPercent: number;
  onClockPercentChange: (v: number) => void;
  onClose: () => void;
  onClearForced: () => void;
  onChangeRecipe: () => void;
  onDeleteMachine: () => void;
};

export function MachineContextMenu({
  x,
  y,
  machineLabel,
  clockPercent,
  onClockPercentChange,
  onClose,
  onClearForced,
  onChangeRecipe,
  onDeleteMachine,
}: Props) {
  const { ref: menuRef, left, top } = useClampedFixedPosition({ x, y }, true);
  const [numDraft, setNumDraft] = useState(String(clockPercent));

  useEffect(() => {
    setNumDraft(String(clockPercent));
  }, [clockPercent]);

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
        className="fixed z-[9999] min-w-[260px] max-w-[min(90vw,320px)] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
        style={{ left, top }}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="border-b border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted)]">
          {machineLabel}
        </p>
        <div
          className="border-b border-[var(--border)] px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            Overclocking
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={CLOCK_MIN}
              max={CLOCK_MAX}
              step={1}
              value={clockPercent}
              onChange={(e) =>
                onClockPercentChange(Number(e.target.value))
              }
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-sky-500"
              aria-label="Vitesse d'horloge en pourcentage"
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label="Pourcentage numérique"
              className="w-12 shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-right text-xs tabular-nums text-[var(--text)]"
              value={numDraft}
              onChange={(e) => setNumDraft(e.target.value.replace(/[^\d.-]/g, ""))}
              onBlur={() => {
                const n = Number.parseInt(numDraft, 10);
                if (Number.isNaN(n)) {
                  setNumDraft(String(clockPercent));
                  return;
                }
                onClockPercentChange(clampClockPercent(n));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="shrink-0 text-[11px] text-[var(--muted)]">%</span>
          </div>
          <p className="mt-1 text-[9px] leading-tight text-[var(--muted)]">
            {CLOCK_MIN}–{CLOCK_MAX} % · défaut {CLOCK_DEFAULT} %
          </p>
        </div>
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
          onClick={() => {
            onChangeRecipe();
          }}
        >
          Changer la recette…
        </button>
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
          onClick={() => {
            onClearForced();
            onClose();
          }}
        >
          Réinitialiser les débits forcés
        </button>
        <hr className="border-[var(--border)]" />
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-sm text-red-400/95 hover:bg-[var(--bg)]"
          onClick={() => {
            onDeleteMachine();
          }}
        >
          Supprimer la machine
        </button>
      </div>
    </>
  );
}
