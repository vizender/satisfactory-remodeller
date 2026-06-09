import { create } from "zustand";
import {
  setupTutorialSandbox,
  teardownTutorialSandbox,
} from "@/lib/tutorialWorld";
import {
  ITEM_IRON_INGOT,
  RECIPE_IRON_INGOT,
  RECIPE_IRON_PLATE,
  RECIPE_SOLID_STEEL,
} from "@/tutorial/constants";
import {
  findMachineByRecipe,
  findMachinePortId,
} from "@/tutorial/portLookup";
import {
  TUTORIAL_STEP_IDS,
  type TutorialStepId,
} from "@/tutorial/steps";
import {
  clearTutorialCompleted,
  isTutorialCompleted,
  markTutorialCompleted,
} from "@/tutorial/tutorialStorage";
import { useWorldStore } from "@/store/useWorldStore";

export type TutorialMarkers = {
  plateMachineId: string | null;
  plateIngotPortId: string | null;
  smelterMachineId: string | null;
  smelterIngotOutPortId: string | null;
  foundryMachineId: string | null;
  /** Usine sandbox (canvas vide) — tout le tutoriel s’y déroule. */
  tutorialRootCanvasId: string | null;
  /** Usine imbriquée créée à l’étape « createFactory ». */
  nestedFactoryId: string | null;
  nestedFactoryRenamed: boolean;
};

const emptyMarkers = (): TutorialMarkers => ({
  plateMachineId: null,
  plateIngotPortId: null,
  smelterMachineId: null,
  smelterIngotOutPortId: null,
  foundryMachineId: null,
  tutorialRootCanvasId: null,
  nestedFactoryId: null,
  nestedFactoryRenamed: false,
});

export interface TutorialState {
  active: boolean;
  stepIndex: number;
  markers: TutorialMarkers;

  currentStep: () => TutorialStepId | null;
  startTutorial: (opts?: { force?: boolean }) => void;
  skipTutorial: () => void;
  advanceWelcome: () => void;
  advanceComplete: () => void;
  onMachineAdded: (
    recipeKey: string,
    frameId: string,
    linkOriginPortId?: string,
  ) => void;
  onMachineRemoved: (frameId: string) => void;
  onFactoryAdded: (factoryId: string) => void;
  onFactoryRenamed: (factoryId: string, name: string) => void;
  onNavigatedTo: (canvasId: string) => void;
  onPortSwapped: (machineFrameId: string) => void;
  onFactoryRemoved: (factoryId: string) => void;
}

function dismissTutorial(set: (partial: Partial<TutorialState>) => void) {
  markTutorialCompleted();
  set({
    active: false,
    stepIndex: 0,
    markers: emptyMarkers(),
  });
}

function finishTutorial(
  set: (partial: Partial<TutorialState>) => void,
  rootId: string | null,
) {
  teardownTutorialSandbox(rootId);
  dismissTutorial(set);
}

function advanceStep(
  get: () => TutorialState,
  set: (partial: Partial<TutorialState>) => void,
) {
  const next = get().stepIndex + 1;
  if (next >= TUTORIAL_STEP_IDS.length) {
    dismissTutorial(set);
    return;
  }
  const nextStep = TUTORIAL_STEP_IDS[next];
  if (nextStep === "complete") {
    teardownTutorialSandbox(get().markers.tutorialRootCanvasId);
  }
  set({ stepIndex: next });
}

function isOnTutorialRoot(): boolean {
  const { activeCanvasId } = useWorldStore.getState();
  const root = useTutorialStore.getState().markers.tutorialRootCanvasId;
  return !!root && activeCanvasId === root;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  active: false,
  stepIndex: 0,
  markers: emptyMarkers(),

  currentStep: () => {
    const { active, stepIndex } = get();
    if (!active) return null;
    return TUTORIAL_STEP_IDS[stepIndex] ?? null;
  },

  startTutorial: (opts) => {
    if (!opts?.force && isTutorialCompleted()) return;

    const prevRoot = get().markers.tutorialRootCanvasId;
    if (prevRoot) teardownTutorialSandbox(prevRoot);

    if (opts?.force) clearTutorialCompleted();

    const rootId = setupTutorialSandbox();
    if (!rootId) return;
    set({
      active: true,
      stepIndex: 0,
      markers: {
        ...emptyMarkers(),
        tutorialRootCanvasId: rootId,
      },
    });
  },

  skipTutorial: () => {
    finishTutorial(set, get().markers.tutorialRootCanvasId);
  },

  advanceWelcome: () => {
    if (get().currentStep() !== "welcome") return;
    advanceStep(get, set);
  },

  advanceComplete: () => {
    if (get().currentStep() !== "complete") return;
    dismissTutorial(set);
  },

  onMachineAdded: (recipeKey, frameId, linkOriginPortId) => {
    const step = get().currentStep();
    if (!step) return;
    const markers = { ...get().markers };

    if (step === "machineInFactory") {
      if (
        markers.nestedFactoryId &&
        useWorldStore.getState().activeCanvasId === markers.nestedFactoryId
      ) {
        advanceStep(get, set);
      }
      return;
    }

    if (!isOnTutorialRoot()) return;

    if (step === "placePlate" && recipeKey === RECIPE_IRON_PLATE) {
      markers.plateMachineId = frameId;
      markers.plateIngotPortId = findMachinePortId(
        frameId,
        "in",
        ITEM_IRON_INGOT,
      );
      set({ markers });
      advanceStep(get, set);
      return;
    }

    if (
      step === "placeSmelter" &&
      recipeKey === RECIPE_IRON_INGOT &&
      linkOriginPortId &&
      linkOriginPortId === markers.plateIngotPortId
    ) {
      markers.smelterMachineId = frameId;
      markers.smelterIngotOutPortId = findMachinePortId(
        frameId,
        "out",
        ITEM_IRON_INGOT,
      );
      set({ markers });
      advanceStep(get, set);
      return;
    }

    if (
      step === "connectFoundry" &&
      recipeKey === RECIPE_SOLID_STEEL &&
      linkOriginPortId &&
      linkOriginPortId === markers.smelterIngotOutPortId
    ) {
      markers.foundryMachineId = frameId;
      set({ markers });
      advanceStep(get, set);
    }
  },

  onMachineRemoved: (frameId) => {
    if (get().currentStep() !== "deletePlate") return;
    if (frameId !== get().markers.plateMachineId) return;
    advanceStep(get, set);
  },

  onFactoryAdded: (factoryId) => {
    const step = get().currentStep();
    const markers = { ...get().markers };

    if (step === "createFactory" && isOnTutorialRoot()) {
      markers.nestedFactoryId = factoryId;
      set({ markers });
      advanceStep(get, set);
      return;
    }

    if (
      step === "nestedFactory" &&
      markers.nestedFactoryId &&
      useWorldStore.getState().activeCanvasId === markers.nestedFactoryId
    ) {
      advanceStep(get, set);
    }
  },

  onFactoryRenamed: (factoryId, name) => {
    if (get().currentStep() !== "renameFactory") return;
    if (factoryId !== get().markers.nestedFactoryId) return;
    if (!name.trim()) return;
    set({
      markers: {
        ...get().markers,
        nestedFactoryRenamed: true,
      },
    });
    advanceStep(get, set);
  },

  onNavigatedTo: (canvasId) => {
    const step = get().currentStep();
    const { nestedFactoryId, tutorialRootCanvasId } = get().markers;

    if (
      step === "enterFactory" &&
      nestedFactoryId &&
      canvasId === nestedFactoryId &&
      get().markers.nestedFactoryRenamed
    ) {
      advanceStep(get, set);
      return;
    }

    if (step === "navBack" && tutorialRootCanvasId && canvasId === tutorialRootCanvasId) {
      advanceStep(get, set);
    }
  },

  onFactoryRemoved: (factoryId) => {
    if (get().currentStep() !== "deleteFactory") return;
    if (factoryId !== get().markers.nestedFactoryId) return;
    advanceStep(get, set);
  },

  onPortSwapped: (machineFrameId) => {
    if (get().currentStep() !== "reorderFoundry") return;
    if (!isOnTutorialRoot()) return;
    const foundryId =
      get().markers.foundryMachineId ??
      findMachineByRecipe(RECIPE_SOLID_STEEL);
    if (machineFrameId !== foundryId) return;
    advanceStep(get, set);
  },
}));
