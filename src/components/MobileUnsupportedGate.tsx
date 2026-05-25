import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import {
  acknowledgeMobileWarning,
  isMobileWarningAcknowledged,
  useMobileLikeViewport,
} from "@/hooks/useMobileViewport";

type Props = {
  children: React.ReactNode;
};

export function MobileUnsupportedGate({ children }: Props) {
  const { t } = useI18n();
  const mobileLike = useMobileLikeViewport();
  const [acknowledged, setAcknowledged] = useState(isMobileWarningAcknowledged);

  if (mobileLike && !acknowledged) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
          <h1 className="text-base font-semibold text-[var(--text)]">
            {t("mobileUnsupportedTitle")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {t("mobileUnsupportedBody")}
          </p>
          <button
            type="button"
            className="mt-5 w-full rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--accent)]/25"
            onClick={() => {
              acknowledgeMobileWarning();
              setAcknowledged(true);
            }}
          >
            {t("mobileUnsupportedContinue")}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
