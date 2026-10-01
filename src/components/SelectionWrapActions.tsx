import { useI18n } from "@/i18n/I18nProvider";

export function SelectionWrapActions({ count, onFactory, onBlueprint }: {
  count: number;
  onFactory: () => void;
  onBlueprint: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-[var(--border)] py-1">
      <p className="px-3 py-1 text-[10px] text-[var(--muted)]">
        {t("wrapSelectionHint", { count })}
      </p>
      <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg)]" onClick={onFactory}>
        {t("wrapInFactory")}
      </button>
      <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg)]" onClick={onBlueprint}>
        {t("wrapInBlueprint")}
      </button>
    </div>
  );
}
