import type { NodeProps } from "@xyflow/react";
import { useI18n } from "@/i18n/I18nProvider";
import { useDocumentStore } from "@/store/useDocumentStore";

export function BoundaryFrameNode({ id, data, selected }: NodeProps) {
  const { t } = useI18n();
  const remove = useDocumentStore((s) => s.onNodesChange);
  const input = data.boundaryKind === "in";
  return (
    <div
      className={`relative h-full w-full cursor-grab rounded-lg border bg-[var(--surface)] shadow-md active:cursor-grabbing ${input ? "border-cyan-400/70 shadow-cyan-500/10" : "border-violet-400/70 shadow-violet-500/10"} ${selected ? "ring-2 ring-[var(--accent)]" : ""}`}
    >
      <div className={`flex h-7 items-center justify-between gap-1 px-2 text-[10px] font-bold uppercase tracking-wide ${input ? "text-cyan-700 dark:text-cyan-300" : "text-violet-700 dark:text-violet-300"}`}>
        <span className="truncate">{input ? "⇥" : "⇤"} {t(input ? "boundaryInputShort" : "boundaryOutputShort")} {Number(data.boundaryIndex) + 1}</span>
        <button
          type="button"
          aria-label={t("deleteBoundaryPort")}
          title={t("deleteBoundaryPort")}
          className="nodrag nopan rounded px-1 text-sm leading-none text-[var(--muted)] hover:bg-red-500/15 hover:text-red-300"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            remove([{ type: "remove", id }]);
          }}
        >×</button>
      </div>
    </div>
  );
}
