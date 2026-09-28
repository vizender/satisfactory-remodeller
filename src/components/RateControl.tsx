import { useRef, useState } from "react";

type Props = {
  label: string;
  value: number;
  step: number;
  max?: number;
  active: boolean;
  onCommit: (value: number) => void;
};

/** Inline numeric setting; edits commit on Enter/blur without dragging the canvas. */
export function RateControl({
  label,
  value,
  step,
  max,
  active,
  onCommit,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelBlur = useRef(false);
  const commit = (raw: string) => {
    const parsed = Number(raw.trim().replace(",", "."));
    if (raw.trim() && Number.isFinite(parsed)) {
      onCommit(Math.min(max ?? Infinity, Math.max(0, parsed)));
    }
    setDraft(null);
  };
  const bump = (direction: number) => {
    const parsed = draft === null ? value : Number(draft.replace(",", "."));
    commit(
      String((Number.isFinite(parsed) ? parsed : value) + direction * step),
    );
  };
  const buttonClass = "h-full w-6 bg-[var(--bg)] hover:text-[var(--accent)]";
  return (
    <div
      className="nodrag nopan flex items-center justify-between gap-2 text-[11px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span
        className={
          active ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"
        }
      >
        {label}
      </span>
      <span
        className={`flex h-7 items-center overflow-hidden rounded border ${active ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
      >
        <button
          type="button"
          aria-label={`${label} −${step}`}
          className={buttonClass}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(-1)}
        >
          −
        </button>
        <input
          aria-label={label}
          inputMode="decimal"
          className="w-[66px] bg-[var(--surface)] text-center tabular-nums outline-none"
          value={draft ?? String(Number(value.toFixed(3)))}
          onFocus={() => setDraft(String(Number(value.toFixed(6))))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            if (cancelBlur.current) {
              cancelBlur.current = false;
              setDraft(null);
            } else commit(e.target.value);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelBlur.current = true;
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          aria-label={`${label} +${step}`}
          className={buttonClass}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => bump(1)}
        >
          +
        </button>
      </span>
    </div>
  );
}
