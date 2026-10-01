import type { NodeProps } from "@xyflow/react";
import { useI18n } from "@/i18n/I18nProvider";

export function BoundaryFrameNode({ data, selected }: NodeProps) {
  const { t } = useI18n();
  return (
    <div
      className={`h-full w-full rounded-md ${selected ? "ring-2 ring-[var(--accent)]" : ""}`}
    >
      <div className="absolute -top-6 whitespace-nowrap text-xs font-semibold text-[var(--muted)]">
        {t(data.boundaryKind === "in" ? "factoryInput" : "factoryOutput")}{" "}
        {Number(data.boundaryIndex) + 1}
      </div>
    </div>
  );
}
