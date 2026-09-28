import type { NodeProps } from "@xyflow/react";
import { ItemIconSlot } from "@/components/ItemIconSlot";
import { MachineIconSlot } from "@/components/MachineIconSlot";
import { RateControl } from "@/components/RateControl";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { nominalConsumerMw } from "@/data/buildingPower";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { useI18n } from "@/i18n/I18nProvider";
import { findRecipeByKey } from "@/lib/recipeLookup";
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
  const machineClassId = recipe?.producedIn?.[0];
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
              title={recipe.name}
            >
              {recipe.name}
            </div>
            <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto border-t border-[var(--border)] pt-2">
              {(
                [
                  ["in", rates.inputs],
                  ["out", rates.outputs],
                ] as const
              ).map(([kind, rows]) => (
                <section key={kind}>
                  <h3
                    className={`mb-1 text-[9px] font-semibold uppercase tracking-wide ${kind === "in" ? "text-emerald-500" : "text-sky-500"}`}
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
                        className="flex items-center gap-1 text-[9px]"
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
                    ((rates.craftsPerMinute * clock) / 100) *
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
