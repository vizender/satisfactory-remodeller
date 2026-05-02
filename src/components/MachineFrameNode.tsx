import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import { ItemIconSlot } from "@/components/ItemIconSlot";
import { MachineIconSlot } from "@/components/MachineIconSlot";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { nominalConsumerMw } from "@/data/buildingPower";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { clampClockPercent, clockMultiplier } from "@/lib/clockSpeed";
import { findRecipeByKey } from "@/lib/recipeLookup";
import { consumerPowerMwAtClock } from "@/lib/powerCalculations";
import type { MachineFrameData } from "@/types/graph";
import { itemRatesForRecipe } from "@/types/graph";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;

export function MachineFrameNode(props: NodeProps) {
  const { id } = props;
  const d = props.data as MachineFrameData & { missingRecipe?: boolean };
  const recipe = useMemo(() => findRecipeByKey(d.recipeKey), [d.recipeKey]);
  const rates = useMemo(
    () => (recipe ? itemRatesForRecipe(recipe) : null),
    [recipe],
  );

  const machineClassId = recipe?.producedIn?.[0];
  const clockPct = clampClockPercent(d.clockPercent);
  const clockMult = clockMultiplier(d.clockPercent);

  const { effectiveRate, machineMultiplier } = useFlowSolve();
  const m = machineMultiplier[id] ?? 1;
  /**
   * Copies « pleine cadence équivalente » : multiplicateur du solveur (débit imposé par le graphe)
   * × facteur 100/horloge (chaque bâtiment à C % équivaut à C/100 machine à 100 % pour ce débit).
   */
  const nombreMachinesPourDebit = useMemo(() => {
    if (clockPct <= 0) return null;
    return m * (100 / clockPct);
  }, [m, clockPct]);

  const powerMw = useMemo(() => {
    if (!machineClassId) return null;
    const n = nominalConsumerMw(machineClassId);
    if (n === undefined) return null;
    return consumerPowerMwAtClock(n, d.clockPercent);
  }, [machineClassId, d.clockPercent]);

  const leftOffset = PORT_W + GUTTER;

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden rounded-xl">
      <div
        className="absolute flex min-h-0 cursor-grab flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1.5 shadow-inner active:cursor-grabbing"
        style={{
          left: leftOffset,
          width: BODY_W,
          top: 0,
          bottom: 0,
        }}
        title="Glisser pour déplacer la machine"
      >
        {d.missingRecipe || !recipe || !rates ? (
          <>
            <div className="shrink-0 text-sm font-semibold text-[var(--text)]">
              {d.label}
            </div>
            <p className="mt-1 shrink-0 text-[10px] text-amber-400/90">
              Recette introuvable : {d.recipeKey}
            </p>
          </>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold leading-tight text-[var(--text)]">
              <span className="min-w-0 truncate">{d.label}</span>
              <MachineIconSlot classId={machineClassId} size="md" />
            </div>
            <div className="mt-0.5 shrink-0 text-[11px] leading-snug text-[var(--muted)]">
              {recipe.name}
            </div>
            <div className="mt-1 min-h-0 shrink space-y-1 border-t border-[var(--border)] pt-1 text-[10px] leading-snug">
              {rates.inputs.length > 0 ? (
                <div>
                  <div className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-400/90">
                    Entrées / min (récap résolu)
                  </div>
                  <ul className="space-y-1">
                    {rates.inputs.map((row, i) => {
                      const pid = `${id}-in-${i}`;
                      const er = effectiveRate[pid] ?? row.perMinute;
                      return (
                        <li
                          key={`ri-${row.itemId}-${row.amountPerCraft}`}
                          className="flex items-center gap-1.5"
                        >
                          <ItemIconSlot itemId={row.itemId} />
                          <span className="min-w-0 flex-1 text-[var(--text)]">
                            {row.displayName}
                            <span className="text-[var(--muted)]">
                              {" "}
                              ×{row.amountPerCraft}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-emerald-300/90">
                            {er.toFixed(1)}/min
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {rates.outputs.length > 0 ? (
                <div>
                  <div className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-400/90">
                    Sorties / min (récap résolu)
                  </div>
                  <ul className="space-y-1">
                    {rates.outputs.map((row, i) => {
                      const pid = `${id}-out-${i}`;
                      const er = effectiveRate[pid] ?? row.perMinute;
                      return (
                        <li
                          key={`ro-${row.itemId}-${row.amountPerCraft}`}
                          className="flex items-center gap-1.5"
                        >
                          <ItemIconSlot itemId={row.itemId} />
                          <span className="min-w-0 flex-1 text-[var(--text)]">
                            {row.displayName}
                            <span className="text-[var(--muted)]">
                              {" "}
                              ×{row.amountPerCraft}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-sky-300/90">
                            {er.toFixed(1)}/min
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="shrink-0 space-y-px border-t border-[var(--border)] pt-1 text-[9px] leading-tight text-[var(--muted)]/85">
                <div>
                  Nombre de machines :{" "}
                  {nombreMachinesPourDebit !== null ? (
                    <span className="tabular-nums text-[var(--text)]/90">
                      {nombreMachinesPourDebit.toFixed(2)}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div>Overclocking : {clockPct} %</div>
                <div>Amplificateur (Sloop) : —</div>
                <div>
                  Puissance :{" "}
                  {powerMw !== null ? (
                    <span className="tabular-nums text-[var(--text)]/90">
                      {powerMw.toFixed(2)} MW
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div>
                  {(rates.craftsPerMinute * clockMult * m).toFixed(1)} crafts/min
                  · {recipe.duration}s/craft
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
