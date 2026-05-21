import {
  useInputModality,
  type InputModalityPreference,
} from "@/hooks/useInputModality";

const OPTIONS: { value: InputModalityPreference; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "trackpad", label: "Trackpad" },
  { value: "mouse", label: "Souris" },
];

const HINT: Record<InputModalityPreference, string> = {
  auto: "Détection automatique : molette fine = trackpad, gros pas = souris.",
  trackpad: "Défilement à deux doigts = déplacer le plan ; pincer ou Ctrl+défiler = zoom.",
  mouse: "Molette = zoom ; clic-glisser sur le fond = déplacer le plan.",
};

export function InputModalityControl() {
  const { preference, setPreference, effective } = useInputModality();

  return (
    <div
      className="flex items-center gap-2 text-xs text-[var(--muted)]"
      title={HINT[preference]}
    >
      <label htmlFor="input-modality" className="sr-only">
        Mode de navigation
      </label>
      <span className="hidden sm:inline">Navigation</span>
      <select
        id="input-modality"
        value={preference}
        onChange={(e) =>
          setPreference(e.target.value as InputModalityPreference)
        }
        className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
        title={HINT[preference]}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {preference === "auto" ? (
        <span className="hidden md:inline text-[10px]">
          ({effective === "trackpad" ? "trackpad" : "souris"})
        </span>
      ) : null}
    </div>
  );
}
