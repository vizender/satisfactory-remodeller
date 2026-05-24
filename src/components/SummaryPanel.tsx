import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { mergeCanvasGraphsForSummary } from "@/lib/canvasTree";
import { computeEnergyLedger } from "@/lib/energyLedger";
import { PRODUCTION_BUILDING_POWER_EXPONENT } from "@/lib/powerCalculations";
import { useWorldStore } from "@/store/useWorldStore";

export function SummaryPanel() {
  const { t } = useI18n();
  const activeCanvasId = useWorldStore((s) => s.activeCanvasId);
  const canvasMap = useWorldStore((s) => s.canvasMap);
  const [active, setActive] = useState<"energy">("energy");

  const merged = useMemo(
    () => mergeCanvasGraphsForSummary(canvasMap, activeCanvasId),
    [canvasMap, activeCanvasId],
  );

  const ledger = useMemo(
    () =>
      computeEnergyLedger(
        merged.nodes,
        merged.edges,
        merged.forcedPortRates,
      ),
    [merged],
  );

  const deficitMw = ledger.generatorCapacityMw - ledger.consumerTotalMw;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="flex border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setActive("energy")}
          className={
            active === "energy"
              ? "flex-1 border-b-2 border-sky-500/90 bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
              : "flex-1 px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg)]/80"
          }
        >
          {t("energyTab")}
        </button>
      </div>

      {active === "energy" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 text-sm">
          {merged.nestedFactoryCount > 0 ? (
            <p className="mb-2 text-[10px] text-[var(--muted)]">
              {t("summaryNestedFactories", {
                count: merged.nestedFactoryCount,
              })}
            </p>
          ) : null}
          <section>
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("consumption")}
            </h2>
            <dl className="mt-2 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
                <dt className="text-[var(--muted)]">{t("consumerTotal")}</dt>
                <dd className="tabular-nums font-medium text-[var(--text)]">
                  {ledger.consumerTotalMw.toFixed(1)} MW
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">{t("consumerBaseline")}</dt>
                <dd className="tabular-nums text-[var(--text)]">
                  {ledger.consumerBaseline100Mw.toFixed(1)} MW
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-amber-300/90">{t("overclockExtra")}</dt>
                <dd className="tabular-nums text-amber-200/90">
                  +{ledger.overclockExtraMw.toFixed(1)} MW
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sky-300/90">{t("underclockSaved")}</dt>
                <dd className="tabular-nums text-sky-200/90">
                  −{ledger.underclockSavedMw.toFixed(1)} MW
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
              {t("consumptionHelp", { exp: PRODUCTION_BUILDING_POWER_EXPONENT })}
            </p>
          </section>

          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("production")}
            </h2>
            <dl className="mt-2 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">{t("buildingsOnGraph")}</dt>
                <dd className="tabular-nums text-[var(--text)]">
                  {ledger.generatorCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
                <dt className="text-[var(--muted)]">{t("generatorCapacity")}</dt>
                <dd className="tabular-nums font-medium text-emerald-300/90">
                  {ledger.generatorCapacityMw.toFixed(0)} MW
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
              {t("productionHelp")}
            </p>
          </section>

          <section className="mt-5 border-t border-[var(--border)] pt-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("balance")}
            </h2>
            <p className="mt-1.5 text-[13px] tabular-nums text-[var(--text)]">
              {deficitMw >= 0 ? (
                <span className="text-emerald-300/90">
                  {t("balanceSurplus", {
                    mw: deficitMw.toFixed(1),
                  })}
                </span>
              ) : (
                <span className="text-amber-300/90">
                  {t("balanceDeficit", {
                    mw: deficitMw.toFixed(1),
                  })}
                </span>
              )}
            </p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              {t("balanceHelp")}
            </p>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
