import { scaledPowerShards } from "@/lib/factoryHierarchy";
import type { NodeProps } from "@xyflow/react";
import { FACTORY_LAYOUT } from "@/constants/factoryLayout";
import { MACHINE_LAYOUT as L } from "@/constants/machineLayout";
import { useI18n } from "@/i18n/I18nProvider";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { useFactoryHierarchy } from "@/hooks/useFactoryHierarchy";
import { useWorldStore } from "@/store/useWorldStore";
import { RateControl } from "./RateControl";
import type { FactoryFrameData } from "@/types/graph";

export function FactoryFrameNode({ id, selected, data }: NodeProps) {
  const { t } = useI18n();
  const d = data as FactoryFrameData;
  const totals = useFactoryHierarchy().totals[id];
  const solve = useFlowSolve();
  const blueprint = Boolean(d.blueprintId);
  const expanded = Boolean(d.boundary?.inputs.length || d.boundary?.outputs.length);
  const extended = Math.max(d.boundary?.inputs.length ?? 0, d.boundary?.outputs.length ?? 0) > 4;
  const count = blueprint ? (solve.machineMultiplier[id] ?? 1) : 1;
  const setCount = useWorldStore((s) => s.setBlueprintCount);
  const library = useWorldStore((s) => s.blueprintLibrary);
  const outdated =
    d.blueprintId &&
    library[d.blueprintId] &&
    d.blueprintRevision !== library[d.blueprintId].revision;
  return (
    <div
      className="relative h-full w-full"
      style={!expanded ? { width: FACTORY_LAYOUT.WIDTH, height: FACTORY_LAYOUT.HEIGHT } : undefined}
    >
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
        className={`rf-factory-body absolute top-0 flex cursor-grab flex-col justify-center gap-2 rounded-xl border-2 border-dashed bg-[var(--surface)] p-3 active:cursor-grabbing ${selected ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
        style={{
          left: expanded ? L.PORT_W : 0,
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
            <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-xs">
              <div>
                {t("factoryPower")}:{" "}
                {((totals?.consumerTotalMw ?? 0) * count).toFixed(1)} MW
              </div>
              <div>
                {t("factoryShards")}:{" "}
                {scaledPowerShards(totals?.shardLoads ?? [], count)}
              </div>
              <div>
                {t("machineCountControl")}:{" "}
                {((totals?.machines ?? 0) * count).toFixed(2)}
              </div>
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
