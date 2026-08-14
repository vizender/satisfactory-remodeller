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

function ForcedPinIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5 shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <path d="M9.5 1.5a3.5 3.5 0 0 0-3.16 5.01L2.7 10.05a.75.75 0 0 0-.08.96l.07.08a.75.75 0 0 0 .96.08l3.64-3.64A3.5 3.5 0 1 0 9.5 1.5Zm0 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
    </svg>
  );
}

/**
 * Port : thème par état de flux (bleu équilibré, vert surplus, rouge déficit).
 * Entrée en déficit : tout en rouge (pas de mélange vert/rouge).
 */
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
  const setReorderDragSession = useDocumentStore((s) => s.setReorderDragSession);
  const tutorialGates = useTutorialGates();

  const {
    effectiveRate,
    portDelta,
    forcedPortRates,
    setForcedPortRate,
    conflictMachineIds,
    conflictPortIds,
  } = useFlowSolve();

  const dragRef = useRef<DragRef | null>(null);

  const eff = effectiveRate[id] ?? d.perMinute;
  const delta = portDelta[id] ?? 0;
  const forced = forcedPortRates[id];
  const [forceDraft, setForceDraft] = useState<string | null>(null);
  const forceDisplay =
    forceDraft ?? (forced !== undefined ? String(forced) : "");
  const isForced = forced !== undefined && !Number.isNaN(forced);

  const balanced = Math.abs(delta) <= EPS;
  const surplus = delta > EPS;
  const deficit = delta < -EPS;

  let rateClass: string;
  if (isIn) {
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

  const handleIn = cn(
    "rf-port-handle-in !h-3 !w-3 !border !border-[var(--border)]",
    balanced
      ? "!bg-blue-500/90"
      : deficit
        ? "!bg-red-500/90"
        : "!bg-emerald-500/90",
  );
  const handleOut = cn(
    "rf-port-handle-out !h-3 !w-3 !border !border-[var(--border)]",
    balanced
      ? "!bg-sky-500/90"
      : surplus
        ? "!bg-emerald-500/90"
        : "!bg-red-500/90",
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
      if (!reorderable) return;
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
    [
      id,
      restoreAllSiblings,
      setNodePositions,
      setReorderDragSession,
      zoom,
    ],
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
        reorderable && "nodrag nopan",
        (parentInConflict || portOnConflictEdge) && "rf-machine-port-conflict",
        parentSelected && "rf-machine-port-selected",
        parentContainerOutputOff && "opacity-45",
        portOnConflictEdge && "border-red-500/70",
        cardBorder,
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
          className={handleIn}
        />
      ) : parentContainerOutputOff ? null : (
        <Handle
          id="item"
          type="source"
          position={Position.Right}
          className={handleOut}
        />
      )}
      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            "flex items-start gap-1 pl-0.5",
            reorderable &&
              "nodrag nopan cursor-ns-resize touch-none select-none",
          )}
          onPointerDown={reorderable ? onReorderPointerDown : undefined}
          onPointerMove={reorderable ? onReorderPointerMove : undefined}
          onPointerUp={reorderable ? onReorderPointerUp : undefined}
          onPointerCancel={reorderable ? onReorderPointerCancel : undefined}
        >
          <ItemIconSlot itemId={d.itemId} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-medium leading-tight text-[var(--text)]">
              {portLabel}
            </div>
            <div
              className={cn(
                "tabular-nums text-[10px]",
                rateClass,
                isForced && "font-bold",
              )}
            >
              {eff.toFixed(1)}/min
            </div>
            <div className={deltaClass}>
              {surplus ? "+" : ""}
              {delta.toFixed(1)}/min
            </div>
            <div className="text-[9px] text-[var(--muted)]">
              ×{d.amountPerCraft} / craft
            </div>
          </div>
        </div>
        <label
          className="block cursor-text text-[8px] text-[var(--muted)]"
          data-port-force-field
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          {t("portForceLabel")}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "port-force-input nodrag mt-px w-full rounded border bg-[var(--surface)] px-0.5 py-px text-[9px] text-[var(--text)] outline-none focus:border-[var(--accent)]",
              isForced
                ? "border-[var(--accent)]/55 font-bold tabular-nums"
                : "border-[var(--border)]",
            )}
            placeholder={eff.toFixed(1)}
            value={forceDisplay}
            onChange={(e) => setForceDraft(e.target.value)}
            onFocus={() => {
              setForceDraft(
                forced !== undefined ? String(forced) : "",
              );
            }}
            onBlur={(e) => {
              setForceDraft(null);
              const raw = e.target.value.trim();
              if (!raw) setForcedPortRate(id, undefined);
              else {
                const v = parseFloat(raw.replace(",", "."));
                if (!Number.isNaN(v)) setForcedPortRate(id, v);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
          />
        </label>
        {isForced ? (
          <div
            className="mt-0.5 flex items-center gap-0.5 text-[7px] font-medium leading-none text-[var(--accent)]"
            title={t("portForcedBadge")}
          >
            <ForcedPinIcon />
            <span>{t("portForcedBadge")}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
