import { createPortal } from "react-dom";
import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";
import { useI18n } from "@/i18n/I18nProvider";
import { SelectionWrapActions } from "./SelectionWrapActions";

export function SelectionWrapMenu({ x, y, count, onClose, onFactory, onBlueprint }: {
  x: number; y: number; count: number;
  onClose: () => void; onFactory: () => void; onBlueprint: () => void;
}) {
  const { t } = useI18n();
  const { ref, left, top } = useClampedFixedPosition({ x, y }, true);
  return createPortal(<>
    <button type="button" className="fixed inset-0 z-[9998] cursor-default" aria-label={t("closeMenu")} onClick={onClose} />
    <div ref={ref} role="menu" className="fixed z-[9999] min-w-[240px] rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl" style={{ left, top }}>
      <SelectionWrapActions count={count} onFactory={onFactory} onBlueprint={onBlueprint} />
    </div>
  </>, document.body);
}
