import type { NodeProps } from "@xyflow/react";
import { ItemIconSlot } from "@/components/ItemIconSlot";
import { MachineIconSlot } from "@/components/MachineIconSlot";
import { RateControl } from "@/components/RateControl";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { nominalConsumerMw } from "@/data/buildingPower";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { useI18n } from "@/i18n/I18nProvider";
import { findRecipeByKey } from "@/lib/recipeLookup";
import { isMinerRecipe, machineClassForFrame, minerMk, minerPurity, minerRateMultiplier } from "@/lib/minerModifiers";
import { consumerPowerMwAtClock } from "@/lib/powerCalculations";
import { useDocumentStore } from "@/store/useDocumentStore";
import { itemRatesForRecipe, type MachineFrameData } from "@/types/graph";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;

export function MachineFrameNode({ id, selected, data }: NodeProps) {
  const { t } = useI18n();
  const d = data as MachineFrameData & { missingRecipe?: boolean };
  const recipe = findRecipeByKey(d.recipeKey);
  const rates = recipe ? itemRatesForRecipe(recipe) : null;
  const {
    effectiveRate,
    machineMultiplier,
    machineClockPercent,
    conflictMachineIds,
  } = useFlowSolve();
  const count = machineMultiplier[id] ?? 1;
  const clock = machineClockPercent[id] ?? d.clockPercent ?? 100;
  const setCount = useDocumentStore((s) => s.setMachineCount);
  const setClock = useDocumentStore((s) => s.setMachineClockPercent);
  const setMinerMk = useDocumentStore((s) => s.setMinerMk);
  const setMinerPurity = useDocumentStore((s) => s.setMinerPurity);
  const miner = isMinerRecipe(recipe);
  const recipeDisplayName = miner
    ? recipe!.name.replace(/^Miner Mk\.1\s*[—-]\s*/, "").replace(/\s*\(60\/min\)$/, "")
    : recipe?.name;
  const machineClassId = machineClassForFrame(recipe, d);
  const nominal = machineClassId
    ? nominalConsumerMw(machineClassId)
    : undefined;
  const power =
    nominal === undefined ? null : consumerPowerMwAtClock(nominal, clock);
  return (
    <div className="relative h-full w-full overflow-visible">
      <div
        className={`rf-machine-body absolute flex h-full cursor-grab flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm active:cursor-grabbing ${selected ? "rf-machine-body-selected" : ""} ${conflictMachineIds.includes(id) ? "rf-machine-body-conflict" : ""}`}
        style={{ left: PORT_W + GUTTER, width: BODY_W }}
      >
        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="truncate" title={d.label}>
            {d.label}
          </span>
          <MachineIconSlot classId={machineClassId} size="md" />
        </div>
        {!recipe || !rates ? (
          <p className="mt-2 text-xs text-amber-500">
            {t("recipeNotFound", { key: d.recipeKey })}
          </p>
        ) : (
          <>
            <div
              className="mt-1 truncate text-[10px] text-[var(--muted)]"
              title={recipeDisplayName}
            >
              {recipeDisplayName}
            </div>
            <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto border-t border-[var(--border)] pt-2">
              {(
                [
                  ["in", rates.inputs],
                  ["out", rates.outputs],
                ] as const
              ).map(([kind, rows]) => (
                <section key={kind} className="min-w-0">
                  <h3
                    className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${kind === "in" ? "text-emerald-500" : "text-sky-500"}`}
                  >
                    {t(
                      kind === "in"
                        ? "machineInputsShort"
                        : "machineOutputsShort",
                    )}
                  </h3>
                  <ul className="space-y-1">
                    {rows.map((row, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-1 text-xs"
                        title={`${row.displayName} ×${row.amountPerCraft} / craft`}
                      >
                        <ItemIconSlot itemId={row.itemId} />
                        <span className="min-w-0 flex-1 truncate">
                          {row.displayName}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {(
                            effectiveRate[`${id}-${kind}-${i}`] ?? row.perMinute
                          ).toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="mt-2 shrink-0 space-y-1.5 border-t border-[var(--border)] pt-2">
              {miner && (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <label className="flex items-center justify-between gap-1">
                    <span>{t("minerMk")}</span>
                    <select className="nodrag min-w-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5" value={minerMk(d)} onChange={(e) => setMinerMk(id, Number(e.target.value) as 1 | 2 | 3)}>
                      <option value={1}>Mk.1</option><option value={2}>Mk.2</option><option value={3}>Mk.3</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-1">
                    <span>{t("minerPurity")}</span>
                    <select className="nodrag min-w-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5" value={minerPurity(d)} onChange={(e) => setMinerPurity(id, e.target.value as "impure" | "normal" | "pure")}>
                      <option value="impure">{t("minerImpure")}</option><option value="normal">{t("minerNormal")}</option><option value="pure">{t("minerPure")}</option>
                    </select>
                  </label>
                </div>
              )}
              <RateControl
                label={t("machineCountControl")}
                value={count}
                step={1}
                active={d.operatingMode === "count"}
                onCommit={(v) => setCount(id, v)}
              />
              <RateControl
                label={t("machineClockControl")}
                value={clock}
                step={10}
                max={250}
                active={d.operatingMode !== "count"}
                onCommit={(v) => setClock(id, v)}
              />
              <div className="flex justify-between text-[10px] text-[var(--muted)]">
                <span>{t("machineAmplifierLine")}</span>
                <span>
                  {t("machinePowerLine")}{" "}
                  {power === null ? "—" : `${power.toFixed(2)} MW`}
                </span>
              </div>
              <div className="text-[10px] text-[var(--muted)]">
                {t("machineCraftsLine", {
                  rate: (
                    ((rates.craftsPerMinute * (miner ? minerRateMultiplier(d) : 1) * clock) / 100) *
                    count
                  ).toFixed(1),
                  duration: String(recipe.duration),
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
