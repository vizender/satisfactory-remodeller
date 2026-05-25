import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { useTutorialStore } from "@/store/useTutorialStore";
import { tutorialMessageKey } from "@/tutorial/steps";

export function TutorialOverlay() {
  const { t } = useI18n();
  const active = useTutorialStore((s) => s.active);
  const step = useTutorialStore((s) => s.currentStep());
  const advanceWelcome = useTutorialStore((s) => s.advanceWelcome);
  const skipTutorial = useTutorialStore((s) => s.skipTutorial);

  if (!active || !step) return null;

  const isWelcome = step === "welcome";

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[10050] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-[var(--accent)]/40 bg-[var(--surface)] p-4 shadow-2xl"
      role="region"
      aria-live="polite"
      aria-label={t("tutorialPanelAria")}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">
          {t("tutorialTitle")}
        </h2>
        <button
          type="button"
          className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
          onClick={skipTutorial}
        >
          {t("tutorialSkipAll")}
        </button>
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--text)]">
        {t(tutorialMessageKey(step) as MessageKey)}
      </p>
      {isWelcome ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)]/25"
            onClick={advanceWelcome}
          >
            {t("tutorialNext")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
