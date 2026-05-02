import { getMachineIconUrl } from "@/lib/iconUrls";
import { formatMachineGroupLabel } from "@/lib/recipeFilters";

type Props = {
  /** Classe machine Satisfactory (`Desc_*_C`). */
  classId: string | null | undefined;
  /** Taille du carré (défaut : même grille que les ports). */
  size?: "sm" | "md";
};

const sizeCls = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

/**
 * Icône machine depuis `Assets/icons/buildings/` + `_manifest.json`.
 */
export function MachineIconSlot({ classId, size = "md" }: Props) {
  const dim = sizeCls[size];
  const alt = classId ? formatMachineGroupLabel(classId) : "";
  const src = classId ? getMachineIconUrl(classId) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        title={alt}
        className={`${dim} shrink-0 rounded object-contain`}
      />
    );
  }
  return (
    <div
      className={`${dim} shrink-0 rounded border border-dashed border-[var(--border)] bg-[var(--bg)]/80`}
      title={classId ? `${alt} — icône à ajouter` : ""}
      data-machine-class={classId ?? ""}
      aria-hidden
    />
  );
}
