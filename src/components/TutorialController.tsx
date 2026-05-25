import { useEffect } from "react";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { useTutorialStore } from "@/store/useTutorialStore";
import { isTutorialCompleted } from "@/tutorial/tutorialStorage";

type Props = {
  draftReady: boolean;
};

/** Auto-starts tutorial on first visit after draft hydration. */
export function TutorialController({ draftReady }: Props) {
  const startTutorial = useTutorialStore((s) => s.startTutorial);

  useEffect(() => {
    if (!draftReady) return;
    if (isTutorialCompleted()) return;
    const id = window.setTimeout(() => startTutorial(), 0);
    return () => window.clearTimeout(id);
  }, [draftReady, startTutorial]);

  return <TutorialOverlay />;
}
