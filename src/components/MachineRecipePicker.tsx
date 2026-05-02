import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ItemIconSlot } from "@/components/ItemIconSlot";
import { MachineIconSlot } from "@/components/MachineIconSlot";
import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";
import { recipeRepresentativeItemId } from "@/lib/iconUrls";
import {
  type RecipeFilter,
  filterRecipes,
  groupRecipesByMachine,
  formatMachineGroupLabel,
  listCraftMachineGroupKeys,
  recipeMatchesSearchQuery,
} from "@/lib/recipeFilters";
import type { RecipeIndexEntry } from "@/types/satisfactory";
import { formatItemClassId } from "@/types/graph";

type TabId = "machines";

type AltFilterMode = "all" | "noAlt" | "altOnly";

type Props = {
  anchorScreen: { x: number; y: number };
  onClose: () => void;
  onPick: (recipeKey: string) => void;
  recipeFilter: RecipeFilter;
  /** Sous-titre optionnel (ex. filtre port). */
  subtitle?: string;
};

export function MachineRecipePicker({
  anchorScreen,
  onClose,
  onPick,
  recipeFilter,
  subtitle,
}: Props) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("machines");

  const allMachineKeys = useMemo(() => listCraftMachineGroupKeys(), []);

  const [allowedMachines, setAllowedMachines] = useState<Set<string>>(
    () => new Set(allMachineKeys),
  );

  const [altMode, setAltMode] = useState<AltFilterMode>("all");

  const { ref: panelRef, left, top } = useClampedFixedPosition(anchorScreen, true);

  const baseList = useMemo(
    () => filterRecipes(recipeFilter),
    [recipeFilter],
  );

  const afterMachineFilter = useMemo(() => {
    if (allowedMachines.size === allMachineKeys.length) return baseList;
    if (allowedMachines.size === 0) return [];
    return baseList.filter((r) => {
      const k = r.producedIn?.[0];
      return k ? allowedMachines.has(k) : false;
    });
  }, [baseList, allowedMachines, allMachineKeys.length]);

  const afterAltFilter = useMemo(() => {
    if (altMode === "all") return afterMachineFilter;
    if (altMode === "noAlt")
      return afterMachineFilter.filter((r) => !r.alternate);
    return afterMachineFilter.filter((r) => r.alternate);
  }, [afterMachineFilter, altMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return afterAltFilter;
    return afterAltFilter.filter((r) => recipeMatchesSearchQuery(r, q));
  }, [afterAltFilter, search]);

  const grouped = useMemo(
    () => groupRecipesByMachine(filtered),
    [filtered],
  );

  const toggleMachine = useCallback((key: string) => {
    setAllowedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllMachines = useCallback(() => {
    setAllowedMachines(new Set(allMachineKeys));
  }, [allMachineKeys]);

  const selectNoMachines = useCallback(() => {
    setAllowedMachines(new Set());
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const handlePick = (r: RecipeIndexEntry) => {
    onPick(r.recipeKey);
    onClose();
  };

  const tabBtn =
    "rounded px-3 py-2 text-xs font-medium transition-colors border border-transparent";

  const altBtn = (mode: AltFilterMode, label: string) => (
    <button
      key={mode}
      type="button"
      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        altMode === mode
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]"
      }`}
      onClick={() => setAltMode(mode)}
    >
      {label}
    </button>
  );

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[10000] cursor-default bg-black/20"
        aria-label="Fermer"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className="fixed z-[10001] flex max-h-[min(82vh,680px)] w-[min(400px,calc(100vw-16px))] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        style={{ left, top }}
        role="dialog"
        aria-label="Choisir une recette"
      >
        <div className="flex shrink-0 border-b border-[var(--border)] bg-[var(--bg)] px-2 pt-2">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "machines"}
            className={`${tabBtn} ${activeTab === "machines" ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            onClick={() => setActiveTab("machines")}
          >
            Machines
          </button>
          <button
            type="button"
            role="tab"
            disabled
            className={`${tabBtn} cursor-not-allowed text-[var(--muted)] opacity-50`}
            title="Bientôt"
          >
            …
          </button>
        </div>

        {activeTab === "machines" ? (
          <>
            <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
              <input
                type="search"
                autoFocus
                placeholder="Rechercher une recette…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
              {subtitle ? (
                <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted)]">
                  {subtitle}
                </p>
              ) : null}

              <details className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]/60">
                <summary className="cursor-pointer list-none px-2.5 py-2 text-[11px] font-medium text-[var(--text)] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2">
                    <span>Filtres</span>
                    <span className="text-[10px] font-normal text-[var(--muted)]">
                      machines · alternatives
                    </span>
                  </span>
                </summary>
                <div className="space-y-3 border-t border-[var(--border)] px-2.5 pb-3 pt-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Machines
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:bg-[var(--surface)]"
                          onClick={(e) => {
                            e.preventDefault();
                            selectAllMachines();
                          }}
                        >
                          Tout
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                          onClick={(e) => {
                            e.preventDefault();
                            selectNoMachines();
                          }}
                        >
                          Rien
                        </button>
                      </span>
                    </div>
                    <div className="max-h-[min(200px,35vh)] overflow-y-auto overflow-x-hidden rounded-md border border-[var(--border)]/80 bg-[var(--surface)] p-2">
                      <div className="flex flex-wrap gap-1.5">
                        {allMachineKeys.map((key) => {
                          const label = formatMachineGroupLabel(key);
                          const on = allowedMachines.has(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              title={label}
                              onClick={() => toggleMachine(key)}
                              className={`flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-1 text-left text-[11px] leading-tight transition-colors ${
                                on
                                  ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--text)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                                  : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
                              }`}
                            >
                              <MachineIconSlot classId={key} size="sm" />
                              <span className="min-w-0 truncate">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Variantes
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {altBtn("all", "Toutes")}
                      {altBtn("noAlt", "Sans alt")}
                      {altBtn("altOnly", "Alternatives")}
                    </div>
                  </div>
                </div>
              </details>

              <p className="mt-2 text-[10px] text-[var(--muted)]">
                {filtered.length} recette
                {filtered.length !== 1 ? "s" : ""}
                {recipeFilter.mode === "produces"
                  ? ` · producteurs de « ${formatItemClassId(recipeFilter.itemId)} »`
                  : recipeFilter.mode === "consumes"
                    ? ` · consommateurs de « ${formatItemClassId(recipeFilter.itemId)} »`
                    : ""}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">
                  Aucune recette ne correspond.
                </p>
              ) : (
                [...grouped.entries()].map(([groupKey, list]) => (
                  <div key={groupKey} className="mb-3">
                    <div className="sticky top-0 flex items-center gap-2 bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      <MachineIconSlot classId={groupKey} size="sm" />
                      <span className="min-w-0 truncate">
                        {formatMachineGroupLabel(groupKey)}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {list.map((r) => {
                        const previewItemId = recipeRepresentativeItemId(r);
                        const extraProducts = r.products.slice(1);
                        return (
                          <li key={r.recipeKey}>
                            <button
                              type="button"
                              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]"
                              onClick={() => handlePick(r)}
                            >
                              {previewItemId ? (
                                <ItemIconSlot
                                  itemId={previewItemId}
                                  iconHint={{
                                    recipeName: r.name,
                                    alternate: r.alternate,
                                    singleOutputFallback:
                                      r.products.length === 1,
                                  }}
                                />
                              ) : (
                                <div
                                  className="h-4 w-4 shrink-0 rounded border border-dashed border-[var(--border)] bg-[var(--bg)]/80"
                                  aria-hidden
                                />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{r.name}</span>
                                {r.alternate ? (
                                  <span className="ml-2 text-[10px] text-amber-400/90">
                                    alt
                                  </span>
                                ) : null}
                                {extraProducts.length > 0 ? (
                                  <span className="mt-1 flex flex-col gap-0.5">
                                    {extraProducts.map((p) => (
                                      <span
                                        key={p.item}
                                        className="flex items-center gap-1.5 text-[10px] leading-tight text-[var(--muted)]"
                                      >
                                        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&_img]:h-3 [&_img]:w-3">
                                          <ItemIconSlot itemId={p.item} />
                                        </span>
                                        <span className="min-w-0 truncate">
                                          {formatItemClassId(p.item)}
                                        </span>
                                      </span>
                                    ))}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
