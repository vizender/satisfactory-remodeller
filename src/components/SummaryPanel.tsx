import { useMemo, useState } from "react";
import { computeEnergyLedger } from "@/lib/energyLedger";
import { PRODUCTION_BUILDING_POWER_EXPONENT } from "@/lib/powerCalculations";
import { useDocumentStore } from "@/store/useDocumentStore";

const tabs = [{ id: "energy" as const, label: "Énergie" }];

export function SummaryPanel() {
  const nodes = useDocumentStore((s) => s.nodes);
  const edges = useDocumentStore((s) => s.edges);
  const forcedPortRates = useDocumentStore((s) => s.forcedPortRates);
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("energy");

  const ledger = useMemo(
    () => computeEnergyLedger(nodes, edges, forcedPortRates),
    [nodes, edges, forcedPortRates],
  );

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="flex border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={
              active === t.id
                ? "flex-1 border-b-2 border-sky-500/90 bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
                : "flex-1 px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg)]/80"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "energy" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 text-sm">
          <section>
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Consommation
            </h2>
            <dl className="mt-2 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
                <dt className="text-[var(--muted)]">Total (horloge actuelle)</dt>
                <dd className="tabular-nums font-medium text-[var(--text)]">
                  {ledger.consumerTotalMw.toFixed(1)} MW
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Réf. tout à 100 %</dt>
                <dd className="tabular-nums text-[var(--text)]">
                  {ledger.consumerBaseline100Mw.toFixed(1)} MW
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-amber-300/90">Surconso (overclock)</dt>
                <dd className="tabular-nums text-amber-200/90">
                  +{ledger.overclockExtraMw.toFixed(1)} MW
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sky-300/90">Sous-conso (underclock)</dt>
                <dd className="tabular-nums text-sky-200/90">
                  −{ledger.underclockSavedMw.toFixed(1)} MW
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
              Total = Σ (multiplicateur solveur × conso d’une machine à l’horloge
              actuelle). Réf. = même débit avec horloge linéaire à 100 % (m ×
              horloge/100 × MW nominal). Exposant {PRODUCTION_BUILDING_POWER_EXPONENT}{" "}
              (wiki). Sans fiche MW : exclus.
            </p>
          </section>

          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Production (générateurs)
            </h2>
            <dl className="mt-2 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Bâtiments sur le graphe</dt>
                <dd className="tabular-nums text-[var(--text)]">
                  {ledger.generatorCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
                <dt className="text-[var(--muted)]">
                  Puissance max. nominale (type)
                </dt>
                <dd className="tabular-nums font-medium text-emerald-300/90">
                  {ledger.generatorCapacityMw.toFixed(0)} MW
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
              Débit réel et combustible : à modéliser. Ici, somme des sorties
              nominales par type de générateur.
            </p>
          </section>

          <section className="mt-5 border-t border-[var(--border)] pt-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Bilan
            </h2>
            <p className="mt-1.5 text-[13px] tabular-nums text-[var(--text)]">
              {ledger.generatorCapacityMw - ledger.consumerTotalMw >= 0 ? (
                <span className="text-emerald-300/90">
                  +{" "}
                  {(
                    ledger.generatorCapacityMw - ledger.consumerTotalMw
                  ).toFixed(1)}{" "}
                  MW (marge vs conso actuelle)
                </span>
              ) : (
                <span className="text-amber-300/90">
                  {(
                    ledger.generatorCapacityMw - ledger.consumerTotalMw
                  ).toFixed(1)}{" "}
                  MW (déficit vs conso actuelle)
                </span>
              )}
            </p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              Marge = production max. déclarée − conso (ne tient pas compte du
              carburant).
            </p>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
