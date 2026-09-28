import {
  Handle,
  Position,
  useReactFlow,
  useStore,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useRef, useState, type CSSProperties } from "react";
import { ItemIconSlot } from "@/components/ItemIconSlot";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { useI18n } from "@/i18n/I18nProvider";
import { useFlowSolve } from "@/hooks/useFlowSolve";
import { normalizePortSlotPermutation } from "@/lib/buildMachineGraph";
import {
  computeVerticalSlotYs,
  nearestSlotIndex,
} from "@/lib/machinePortLayout";
import { findRecipeByKey } from "@/lib/recipeLookup";
import { useTutorialGates } from "@/hooks/useTutorialGates";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useTutorialStore } from "@/store/useTutorialStore";
import {
  itemPortDisplayName,
  type ContainerFrameData,
  type ItemPortData,
  type MachineFrameData,
} from "@/types/graph";

const { PORT_W, PORT_ROW, FRAME_MIN_H } = MACHINE_LAYOUT;
const EPS = 0.05;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function frameHeightFromNode(n: { style?: CSSProperties } | undefined) {
  if (!n?.style?.height) return FRAME_MIN_H;
  const h = n.style.height;
  if (typeof h === "number") return h;
  if (typeof h === "string" && /^\d+(\.\d+)?px$/.test(h)) {
    return parseFloat(h);
  }
  return 168;
}

type DragRef = {
  pointerId: number;
  origY: number;
  origX: number;
  startCX: number;
  startCY: number;
  frameId: string;
  recipeIdx: number;
  kind: "in" | "out";
  slots: number;
  frameH: number;
  cancelled: boolean;
  /** Réordonnancement engagé (seuil de mouvement dépassé). */
  active: boolean;
  startSlot: number;
  siblingPositions: Record<string, { x: number; y: number }>;
  perm: number[];
};

const REORDER_ACTIVATE_PX = 4;

export function ItemPortNode(props: NodeProps) {
  const { t } = useI18n();
  const { id, data, parentId } = props;
  const d = data as ItemPortData;
  const isIn = d.kind === "in";
  const portLabel = itemPortDisplayName(d.itemId, d.displayName);

  const { getNode } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const setNodePosition = useDocumentStore((s) => s.setNodePosition);
  const setNodePositions = useDocumentStore((s) => s.setNodePositions);
  const swapMachinePortSlots = useDocumentStore((s) => s.swapMachinePortSlots);
  const setReorderDragSession = useDocumentStore(
    (s) => s.setReorderDragSession,
  );
  const tutorialGates = useTutorialGates();

  const {
    effectiveRate,
    portDelta,
    forcedPortRates,
    setForcedPortRate,
    conflictMachineIds,
    conflictPortIds,
    overriddenPortIds,
    portAdvice,
  } = useFlowSolve();

  const dragRef = useRef<DragRef | null>(null);

  const eff = effectiveRate[id] ?? d.perMinute;
  const delta = portDelta[id] ?? 0;
  const forced = forcedPortRates[id];
  const [forceDraft, setForceDraft] = useState<string | null>(null);
  const forceDisplay =
    forceDraft ?? (forced !== undefined ? String(forced) : "");
  const isForced =
    forced !== undefined && Number.isFinite(forced) && forced >= 0;
  const isOverridden = overriddenPortIds.includes(id);
  const hasDeficit = delta < -EPS || (isForced && eff + EPS < forced);
  const advice = portAdvice[id];
  const statusKey = hasDeficit
    ? "portDeficitHelp"
    : isOverridden
      ? "portOverriddenHelp"
      : isForced
        ? "portForcedBadge"
        : advice === "coupled"
          ? "portCoupledHelp"
          : advice === "derived"
            ? "portDerivedHelp"
            : "portFreeHelp";
  const statusSymbol =
    hasDeficit || isOverridden
      ? "!"
      : isForced
        ? "●"
        : advice === "coupled"
          ? "≈"
          : advice === "derived"
            ? "≈"
            : "○";

  const balanced = Math.abs(delta) <= EPS;
  const surplus = delta > EPS;
  const deficit = delta < -EPS;

  let rateClass: string;
  if (hasDeficit) rateClass = "text-red-400";
  else if (isIn) {
    if (balanced) rateClass = "text-blue-400";
    else if (deficit) rateClass = "text-red-400";
    else rateClass = "text-emerald-400";
  } else {
    if (balanced) rateClass = "text-sky-400/95";
    else if (surplus) rateClass = "text-emerald-400";
    else rateClass = "text-red-400";
  }

  const deltaClass = cn(
    "text-[9px] font-medium",
    isIn
      ? deficit
        ? "text-red-400"
        : surplus
          ? "text-emerald-400"
          : "text-[var(--muted)]"
      : surplus
        ? "text-emerald-400"
        : deficit
          ? "text-red-400"
          : "text-[var(--muted)]",
  );

  const cardBorder = cn(
    isIn
      ? balanced
        ? "border-blue-500/40"
        : deficit
          ? "border-red-500/50"
          : "border-emerald-500/45"
      : balanced
        ? "border-sky-500/40"
        : surplus
          ? "border-emerald-500/45"
          : "border-red-500/50",
  );

  const handleStyle = cn(
    "rf-port-connector !h-5 !w-3 !rounded-none !border-0 !bg-transparent",
    hasDeficit ? "text-red-400" : "text-[var(--muted)]",
  );

  const reorderable = d.slotsOnSide > 1;

  const parentSelected = useDocumentStore((s) => {
    if (!parentId) return false;
    const p = s.nodes.find((n) => n.id === parentId);
    return p?.selected ?? false;
  });
  const parentContainerOutputOff = useDocumentStore((s) => {
    if (!parentId || isIn) return false;
    const fr = s.nodes.find(
      (n) => n.id === parentId && n.type === "containerFrame",
    );
    if (!fr) return false;
    return (fr.data as ContainerFrameData).outputEnabled === false;
  });
  const parentInConflict = parentId
    ? conflictMachineIds.includes(parentId)
    : false;
  const portOnConflictEdge = conflictPortIds.includes(id);

  const finishReorder = useCallback(
    (st: DragRef) => {
      const self = getNode(id);
      const y = self?.position.y ?? st.origY;
      const ys = computeVerticalSlotYs(st.slots, st.frameH);
      const endSlot = nearestSlotIndex(y + PORT_ROW / 2, st.slots, st.frameH);
      const startSlot = nearestSlotIndex(
        st.origY + PORT_ROW / 2,
        st.slots,
        st.frameH,
      );
      if (endSlot === startSlot) {
        setNodePosition(id, {
          x: st.origX,
          y: ys[endSlot] ?? st.origY,
        });
      } else {
        swapMachinePortSlots(st.frameId, st.kind, st.recipeIdx, endSlot);
        useTutorialStore.getState().onPortSwapped(st.frameId);
      }
    },
    [getNode, id, setNodePosition, swapMachinePortSlots],
  );

  const restoreAllSiblings = useCallback(
    (st: DragRef) => {
      const entries = Object.entries(st.siblingPositions).map(
        ([pid, position]) => ({
          id: pid,
          position: { ...position },
        }),
      );
      setNodePositions(entries);
    },
    [setNodePositions],
  );

  const onReorderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !reorderable) return;
      if (parentId && !tutorialGates.allowPortReorder(parentId)) return;
      if ((e.target as HTMLElement).closest(".react-flow__handle")) return;
      if ((e.target as HTMLElement).closest("[data-port-force-field]")) return;
      e.stopPropagation();
      e.preventDefault();
      const frameNode = parentId ? getNode(parentId) : undefined;
      if (!parentId || !frameNode) return;
      const self = getNode(id);
      if (!self) return;

      const frameFromStore = useDocumentStore
        .getState()
        .nodes.find((n) => n.id === parentId && n.type === "machineFrame");
      const fd = frameFromStore?.data as MachineFrameData | undefined;
      const recipe = fd ? findRecipeByKey(fd.recipeKey) : undefined;
      if (!recipe) return;

      const frameH = frameHeightFromNode(frameNode);
      const nSide =
        d.kind === "in" ? recipe.ingredients.length : recipe.products.length;
      const rawPerm =
        d.kind === "in"
          ? fd?.inputSlotByRecipeIndex
          : fd?.outputSlotByRecipeIndex;
      const perm = normalizePortSlotPermutation(nSide, rawPerm);

      const siblingPositions: Record<string, { x: number; y: number }> = {};
      for (const n of useDocumentStore.getState().nodes) {
        if (n.parentId !== parentId || n.type !== "itemPort") continue;
        const pd = n.data as ItemPortData;
        if (pd.kind !== d.kind) continue;
        siblingPositions[n.id] = { ...n.position };
      }

      const startSlot = nearestSlotIndex(
        self.position.y + PORT_ROW / 2,
        d.slotsOnSide,
        frameH,
      );

      dragRef.current = {
        pointerId: e.pointerId,
        origY: self.position.y,
        origX: self.position.x,
        startCX: e.clientX,
        startCY: e.clientY,
        frameId: parentId,
        recipeIdx: d.portIndex,
        kind: d.kind,
        slots: d.slotsOnSide,
        frameH,
        cancelled: false,
        active: false,
        startSlot,
        siblingPositions,
        perm,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [
      d.kind,
      d.portIndex,
      d.slotsOnSide,
      getNode,
      id,
      parentId,
      reorderable,
      setReorderDragSession,
      tutorialGates,
    ],
  );

  const onReorderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;

      const dx = Math.abs(e.clientX - st.startCX);
      const dy = Math.abs(e.clientY - st.startCY);

      if (!st.active) {
        if (st.cancelled) return;
        if (dx > dy * 1.15 && dx > 8) {
          st.cancelled = true;
          dragRef.current = null;
          return;
        }
        if (dx < REORDER_ACTIVATE_PX && dy < REORDER_ACTIVATE_PX) return;

        st.active = true;
        e.stopPropagation();
        e.preventDefault();
        setReorderDragSession({
          machineFrameId: st.frameId,
          side: st.kind,
        });
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (st.cancelled) return;

      if (st.active && dx > dy * 1.15 && dx > 8) {
        st.cancelled = true;
        restoreAllSiblings(st);
        setReorderDragSession(null);
        dragRef.current = null;
        return;
      }

      const dFlow = (e.clientY - st.startCY) / zoom;
      const ys = computeVerticalSlotYs(st.slots, st.frameH);
      const minY = ys[0] ?? st.origY;
      const maxY = ys[ys.length - 1] ?? minY;
      const raw = st.origY + dFlow;
      const clamped = Math.max(minY, Math.min(maxY, raw));
      const endSlot = nearestSlotIndex(
        clamped + PORT_ROW / 2,
        st.slots,
        st.frameH,
      );

      const nextPos = new Map<string, { x: number; y: number }>();
      for (const [pid, pos] of Object.entries(st.siblingPositions)) {
        nextPos.set(pid, { ...pos });
      }
      nextPos.set(id, { x: st.origX, y: clamped });

      if (endSlot !== st.startSlot) {
        const partnerRecipeIdx = st.perm.findIndex((slot) => slot === endSlot);
        if (partnerRecipeIdx >= 0 && partnerRecipeIdx !== st.recipeIdx) {
          const sideTag = st.kind === "in" ? "in" : "out";
          const partnerId = `${st.frameId}-${sideTag}-${partnerRecipeIdx}`;
          const base = st.siblingPositions[partnerId];
          if (base) {
            nextPos.set(partnerId, {
              x: base.x,
              y: ys[st.startSlot] ?? base.y,
            });
          }
        }
      }

      setNodePositions(
        [...nextPos.entries()].map(([pid, position]) => ({
          id: pid,
          position,
        })),
      );
    },
    [id, restoreAllSiblings, setNodePositions, setReorderDragSession, zoom],
  );

  const onReorderPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* déjà relâché */
      }
      if (!st.active) {
        dragRef.current = null;
        return;
      }
      dragRef.current = null;
      try {
        if (!st.cancelled) finishReorder(st);
      } finally {
        setReorderDragSession(null);
      }
    },
    [finishReorder, setReorderDragSession],
  );

  const onReorderPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      dragRef.current = null;
      restoreAllSiblings(st);
      setReorderDragSession(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
    },
    [restoreAllSiblings, setReorderDragSession],
  );

  return (
    <div
      className={cn(
        "rf-machine-port relative select-none rounded-md border bg-[var(--bg)] px-1 py-1 shadow-sm",
        isIn ? "pl-3 pr-1" : "pl-1 pr-3",
        reorderable && "nodrag nopan",
        (parentInConflict || portOnConflictEdge) && "rf-machine-port-conflict",
        parentSelected && "rf-machine-port-selected",
        parentContainerOutputOff && "opacity-45",
        portOnConflictEdge && "border-red-500/70",
        cardBorder,
        hasDeficit && "rf-machine-port-deficit",
      )}
      style={{
        width: PORT_W,
        height: PORT_ROW,
        boxSizing: "border-box",
      }}
    >
      {isIn ? (
        <Handle
          id="item"
          type="target"
          position={Position.Left}
          className={cn(handleStyle, "rf-port-handle-in")}
        />
      ) : parentContainerOutputOff ? null : (
        <Handle
          id="item"
          type="source"
          position={Position.Right}
          className={cn(handleStyle, "rf-port-handle-out")}
        />
      )}
      <div className="flex h-full flex-col justify-between gap-0.5">
        <div
          className={cn(
            "flex items-center gap-1",
            reorderable && "nodrag nopan cursor-ns-resize touch-none",
          )}
          onPointerDown={reorderable ? onReorderPointerDown : undefined}
          onPointerMove={reorderable ? onReorderPointerMove : undefined}
          onPointerUp={reorderable ? onReorderPointerUp : undefined}
          onPointerCancel={reorderable ? onReorderPointerCancel : undefined}
        >
          <ItemIconSlot itemId={d.itemId} />
          <span
            className="min-w-0 flex-1 truncate text-[10px] font-medium"
            title={portLabel}
          >
            {portLabel}
          </span>
          <span
            role="img"
            aria-label={t(statusKey)}
            title={t(statusKey)}
            className={cn(
              "shrink-0 text-[11px]",
              hasDeficit
                ? "text-red-400"
                : isOverridden
                  ? "text-amber-500"
                  : isForced
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted)]",
            )}
          >
            {statusSymbol}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-1 tabular-nums">
          <span
            className={cn(
              "min-w-0 truncate text-[11px]",
              rateClass,
              isForced && "font-bold",
            )}
            title={`${eff.toFixed(1)}/min`}
          >
            {eff.toFixed(1)}/min
          </span>
          {!balanced && (
            <span
              className={cn(deltaClass, "min-w-0 truncate")}
              title={`${surplus ? "+" : ""}${delta.toFixed(1)}/min`}
            >
              {surplus ? "+" : ""}
              {delta.toFixed(1)}
            </span>
          )}
        </div>
        <label
          className="nodrag nopan flex items-center gap-1 text-[9px] text-[var(--muted)]"
          data-port-force-field
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span>{t("portForceShort")}</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "port-force-input nodrag min-w-0 flex-1 rounded border bg-[var(--surface)] px-1 text-[10px] tabular-nums outline-none focus:border-[var(--accent)]",
              hasDeficit
                ? "border-red-500 text-red-400"
                : isOverridden
                  ? "border-amber-500"
                  : isForced
                    ? "border-[var(--accent)] font-bold"
                    : "border-dashed border-[var(--border)]",
            )}
            title={t(statusKey)}
            aria-label={t("portForceLabel")}
            placeholder="—"
            value={forceDisplay}
            onChange={(e) => setForceDraft(e.target.value)}
            onFocus={() =>
              setForceDraft(forced === undefined ? "" : String(forced))
            }
            onBlur={(e) => {
              const raw = e.target.value.trim();
              setForceDraft(null);
              if (!raw) setForcedPortRate(id, undefined);
              else {
                const v = Number(raw.replace(",", "."));
                if (Number.isFinite(v) && v >= 0) setForcedPortRate(id, v);
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
      </div>
    </div>
  );
}
