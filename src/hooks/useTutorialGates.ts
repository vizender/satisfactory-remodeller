import { useMemo } from "react";
import { useTutorialStore } from "@/store/useTutorialStore";
import { getTutorialGates } from "@/tutorial/gates";

export function useTutorialGates() {
  const active = useTutorialStore((s) => s.active);
  const step = useTutorialStore((s) => s.currentStep());
  const markers = useTutorialStore((s) => s.markers);
  return useMemo(
    () => getTutorialGates(active, step, markers),
    [active, step, markers],
  );
}
