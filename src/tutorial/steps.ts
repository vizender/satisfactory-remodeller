export const TUTORIAL_STEP_IDS = [
  "welcome",
  "placePlate",
  "placeSmelter",
  "deletePlate",
  "connectFoundry",
  "reorderFoundry",
  "createFactory",
  "renameFactory",
  "enterFactory",
  "machineInFactory",
  "nestedFactory",
  "navBack",
  "deleteFactory",
] as const;

export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export function tutorialMessageKey(step: TutorialStepId): `tutorial_${TutorialStepId}` {
  return `tutorial_${step}`;
}
