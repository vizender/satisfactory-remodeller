import { scaledPowerShards } from "@/lib/factoryHierarchy";
import { formatMachineGroupLabel } from "@/lib/recipeFilters";
import type { NodeProps } from "@xyflow/react";
import { MACHINE_LAYOUT as L } from "@/constants/machineLayout";
import { useI18n } from "@/i18n/I18nProvider";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { useFactoryHierarchy } from "@/hooks/useFactoryHierarchy";
import { useWorldStore } from "@/store/useWorldStore";
import { RateControl } from "./RateControl";
import type { FactoryFrameData } from "@/types/graph";

function machineTypeLabel(machineType: string): string {
  const minerTier = /^Desc_MinerMk(\d+)_C$/.exec(machineType)?.[1];
  return minerTier
    ? `${formatMachineGroupLabel(machineType)} Mk.${minerTier}`
    : formatMachineGroupLabel(machineType);
}

export function FactoryFrameNode({ id, selected, data }: NodeProps) {
  const { t } = useI18n();
  const d = data as FactoryFrameData;
  const totals = useFactoryHierarchy().totals[id];
  const solve = useFlowSolve();
  const blueprint = Boolean(d.blueprintId);
  const expanded = Boolean(d.boundary?.inputs.length || d.boundary?.outputs.length);
  const extended = Math.max(d.boundary?.inputs.length ?? 0, d.boundary?.outputs.length ?? 0) > 4;
  const count = blueprint ? (solve.machineMultiplier[id] ?? 1) : 1;
  const machineTypes = Object.entries(totals?.machinesByType ?? {}).sort(
    ([left], [right]) =>
      machineTypeLabel(left).localeCompare(machineTypeLabel(right)),
  );
  const setCount = useWorldStore((s) => s.setBlueprintCount);
  const library = useWorldStore((s) => s.blueprintLibrary);
  const outdated =
    d.blueprintId &&
    library[d.blueprintId] &&
    d.blueprintRevision !== library[d.blueprintId].revision;
  if (!expanded) {
    return (
      <div
        className={`rf-factory-body relative flex h-full w-full cursor-grab items-center justify-center rounded-lg border-2 border-dashed px-2 py-1.5 shadow-sm active:cursor-grabbing ${selected ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]" : "border-[var(--border)] bg-[var(--surface)]"}`}
        title={d.label}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/15 text-lg"
            aria-hidden
          >
            {blueprint ? "▦" : "🏭"}
          </span>
          <div className="min-w-0 text-center">
            <div className="truncate text-xs font-semibold text-[var(--text)]">
              {d.label}
            </div>
            <div className="text-[9px] text-[var(--muted)]">
              {t("factoryDoubleClickOpen")}
            </div>
          </div>
        </div>
        {outdated && <span className="absolute right-1 top-0 text-xs text-amber-500" title={t("blueprintOutdated")}>↻</span>}
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      {extended && (
        <>
          {(d.boundary?.inputs.length ?? 0) > 4 && (
            <div className="absolute bottom-0 left-0 top-0 w-[128px] rounded-lg border border-dashed border-cyan-400/50 bg-cyan-500/5" />
          )}
          {(d.boundary?.outputs.length ?? 0) > 4 && (
            <div className="absolute bottom-0 right-0 top-0 w-[128px] rounded-lg border border-dashed border-violet-400/50 bg-violet-500/5" />
          )}
        </>
      )}
      <div
        className={`rf-factory-body absolute top-0 flex cursor-grab flex-col gap-2 rounded-xl border-2 border-dashed bg-[var(--surface)] p-3 active:cursor-grabbing ${selected ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
        style={{
          left: L.PORT_W,
          width: L.BODY_W,
          height: L.FRAME_MIN_H,
        }}
        title={d.label}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden>{blueprint ? "▦" : "🏭"}</span>
          <span className="min-w-0 truncate text-sm font-semibold">
            {d.label}
          </span>
        </div>
        <p className="text-[10px] text-[var(--muted)]">
          {t("factoryDoubleClickOpen")}
        </p>
        {outdated && (
          <p className="text-xs text-amber-500">↻ {t("blueprintOutdated")}</p>
        )}
        <>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-[var(--border)] pt-2 text-xs">
              <div>
                {t("factoryPower")}:{" "}
                {((totals?.consumerTotalMw ?? 0) * count).toFixed(1)} MW
              </div>
              <div>
                {t("factoryShards")}:{" "}
                {scaledPowerShards(totals?.shardLoads ?? [], count)}
              </div>
              <div>{t("factorySomersloops")}:</div>
              <div>
                {t("machineCountControl")}:{" "}
                {((totals?.machines ?? 0) * count).toFixed(2)}
              </div>
              {machineTypes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4">
                  {machineTypes.map(([machineType, amount]) => (
                    <li key={machineType}>
                      {machineTypeLabel(machineType)}: {Number((amount * count).toFixed(2))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {blueprint ? (
              <>
                <RateControl
                  label={t("blueprintQuantity")}
                  value={count}
                  step={1}
                  active={d.blueprintCount !== undefined}
                  onCommit={(v) => setCount(id, v)}
                />
                <button
                  className="nodrag nopan text-left text-[10px] text-[var(--accent)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCount(id, undefined);
                  }}
                >
                  {t("blueprintAutoQuantity")}
                </button>
              </>
            ) : (
              <p className="text-[10px] text-[var(--muted)]">
                {t("factoryInternalRates")}
              </p>
            )}
        </>
      </div>
    </div>
  );
}
