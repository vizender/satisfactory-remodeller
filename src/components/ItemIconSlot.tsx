import { getItemIconUrl, type ItemIconHint } from "@/lib/iconUrls";
import { formatItemClassId } from "@/types/graph";

/**
 * Icône item (`Assets/icons/items/` + `_manifest.json`). Sans PNG : cadre pointillé.
 */
export function ItemIconSlot({
  itemId,
  src,
  alt,
  iconHint,
}: {
  itemId: string;
  /** Priorité sur la résolution automatique depuis le manifest. */
  src?: string | null;
  alt?: string;
  /** Ex. nom de recette + alt : meilleure corrélation avec les PNG wiki. */
  iconHint?: ItemIconHint;
}) {
  const resolved = src ?? getItemIconUrl(itemId, iconHint);
  const title = alt ?? formatItemClassId(itemId);
  if (resolved) {
    return (
      <img
        src={resolved}
        alt={title}
        title={title}
        className="h-4 w-4 shrink-0 rounded object-contain"
      />
    );
  }
  return (
    <div
      className="h-4 w-4 shrink-0 rounded border border-dashed border-[var(--border)] bg-[var(--bg)]/80"
      title={`${title} — ajoutez le PNG dans Assets/icons/items/`}
      data-item-id={itemId}
      aria-hidden
    />
  );
}
