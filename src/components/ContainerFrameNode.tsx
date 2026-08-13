import type { NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import { ItemIconSlot } from "@/components/ItemIconSlot";
import { MachineIconSlot } from "@/components/MachineIconSlot";
import { CONTAINER_SLOT_COUNT } from "@/constants/container";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { useI18n } from "@/i18n/I18nProvider";
import { useDocumentStore } from "@/store/useDocumentStore";
import {
  formatItemClassId,
  isPortItemAssigned,
  type ContainerFrameData,
  type ItemPortData,
} from "@/types/graph";

const { BODY_W, GUTTER, PORT_W } = MACHINE_LAYOUT;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function ContainerFrameNode(props: NodeProps) {
  const { t } = useI18n();
  const { id, selected } = props;
  const d = props.data as ContainerFrameData;
  const nodes = useDocumentStore((s) => s.nodes);
  const setContainerOutputEnabled = useDocumentStore(
    (s) => s.setContainerOutputEnabled,
  );

  const {
    effectiveRate,
    portStoredPerMin,
    conflictMachineIds,
  } = useFlowSolve();

  const inConflict = conflictMachineIds.includes(id);
  const variant = d.variant ?? "standard";
  const slotCount = CONTAINER_SLOT_COUNT[variant];
  const outputEnabled = d.outputEnabled !== false;

  const slots = useMemo(() => {
    const rows: {
      slot: number;
      itemId: string;
      displayName: string;
      inRate: number;
      outRate: number;
      stored: number;
    }[] = [];
    for (let slot = 0; slot < slotCount; slot++) {
      const inId = `${id}-in-${slot}`;
      const outId = `${id}-out-${slot}`;
      const inNode = nodes.find((n) => n.id === inId);
      const inData = inNode?.data as ItemPortData | undefined;
      const itemId = inData?.itemId ?? "";
      if (!isPortItemAssigned(itemId)) continue;
      rows.push({
        slot,
        itemId,
        displayName: isPortItemAssigned(itemId)
          ? formatItemClassId(itemId)
          : "—",
        inRate: effectiveRate[inId] ?? 0,
        outRate: outputEnabled ? (effectiveRate[outId] ?? 0) : 0,
        stored: portStoredPerMin[inId] ?? 0,
      });
    }
    return rows;
  }, [nodes, id, slotCount, effectiveRate, portStoredPerMin, outputEnabled]);

  const leftOffset = PORT_W + GUTTER;

  return (
    <div className="relative h-full w-full min-h-0 overflow-visible rounded-xl">
      <div
        className={cn(
          "rf-machine-body absolute flex min-h-0 cursor-grab flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1.5 shadow-inner active:cursor-grabbing",
          inConflict && "rf-machine-body-conflict",
          selected && "rf-machine-body-selected",
        )}
        style={{
          left: leftOffset,
          width: BODY_W,
          top: 0,
          bottom: 0,
        }}
        title={d.label}
      >
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold leading-tight text-[var(--text)]">
          <span className="min-w-0 truncate">{d.label}</span>
          <MachineIconSlot classId={d.buildingClassId} size="md" />
        </div>

        <div className="mt-1 flex shrink-0 flex-wrap gap-2 border-b border-[var(--border)] pb-1 text-[9px]">
          <label className="flex cursor-pointer items-center gap-1 text-[var(--muted)]">
            <input
              type="checkbox"
              className="nodrag h-3 w-3 accent-[var(--accent)]"
              checked={outputEnabled}
              onChange={(e) =>
                setContainerOutputEnabled(id, e.target.checked)
              }
              onPointerDown={(e) => e.stopPropagation()}
            />
            {t("containerOutputEnabled")}
          </label>
        </div>

        <div className="mt-1 min-h-0 shrink space-y-1.5 overflow-y-auto text-[10px] leading-snug">
          {slots.length > 0 ? (
            slots.map((row) => (
              <div
                key={row.slot}
                className="rounded border border-[var(--border)]/80 bg-[var(--bg)]/50 px-1 py-1"
              >
                <div className="mb-0.5 flex items-center gap-1.5">
                  <ItemIconSlot itemId={row.itemId} />
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">
                    {row.displayName}
                  </span>
                </div>
                <div className="tabular-nums text-emerald-300/90">
                  {t("containerInRate")}: {row.inRate.toFixed(1)}/min
                </div>
                {outputEnabled ? (
                  <div className="tabular-nums text-sky-300/90">
                    {t("containerOutRate")}: {row.outRate.toFixed(1)}/min
                  </div>
                ) : (
                  <div className="text-[9px] italic text-[var(--muted)]">
                    {t("containerOutputOff")}
                  </div>
                )}
                {row.stored > 0.05 ? (
                  <div className="tabular-nums font-medium text-amber-300/95">
                    {t("containerStored")}: {row.stored.toFixed(1)}/min
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-[9px] text-[var(--muted)]">
              {t("containerConnectHint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
