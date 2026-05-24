import type { NodeProps } from "@xyflow/react";
import { FACTORY_LAYOUT } from "@/constants/factoryLayout";
import { useI18n } from "@/i18n/I18nProvider";
import type { FactoryFrameData } from "@/types/graph";

const { WIDTH, HEIGHT } = FACTORY_LAYOUT;

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function FactoryFrameNode(props: NodeProps) {
  const { t } = useI18n();
  const { selected } = props;
  const d = props.data as FactoryFrameData;

  return (
    <div
      className={cn(
        "flex h-full w-full cursor-grab flex-col items-center justify-center rounded-lg border-2 border-dashed px-2 py-1.5 shadow-sm active:cursor-grabbing",
        selected
          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
          : "border-[var(--border)] bg-[var(--surface)]",
      )}
      style={{ width: WIDTH, height: HEIGHT, minHeight: HEIGHT }}
      title={d.label}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/15 text-lg"
          aria-hidden
        >
          🏭
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
    </div>
  );
}
