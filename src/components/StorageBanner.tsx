import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

const DISMISS_KEY = "remodeller:storage-banner-dismissed";

export function StorageBanner() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  if (dismissed) return null;

  return (
    <div
      className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--accent)]/10 px-4 py-2 text-xs leading-snug text-[var(--text)]"
      role="status"
    >
      <p className="min-w-0">{t("storageBanner")}</p>
      <button
        type="button"
        className="shrink-0 rounded px-2 py-0.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        aria-label={t("dismiss")}
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
