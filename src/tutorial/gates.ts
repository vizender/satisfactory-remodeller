import type { TutorialPickerConstraint } from "@/components/MachineRecipePicker";
import {
  MACHINE_CONSTRUCTOR,
  MACHINE_FOUNDRY,
  MACHINE_SMELTER,
  RECIPE_IRON_INGOT,
  RECIPE_IRON_PLATE,
  RECIPE_SOLID_STEEL,
} from "@/tutorial/constants";
import type { TutorialStepId } from "@/tutorial/steps";
import type { TutorialMarkers } from "@/store/useTutorialStore";
import { WORLD_CANVAS_ID } from "@/types/canvas";

export type TutorialGates = {
  allowPaneRecipePicker: boolean;
  allowPortRecipePicker: boolean;
  allowPortLinkDrag: boolean;
  allowFreeConnect: boolean;
  allowMachineContextMenu: boolean;
  allowFactoryContextMenu: boolean;
  allowFactoryContextMenuFor: (factoryId: string) => boolean;
  allowFactoryDoubleClick: boolean;
  allowFactoryOpen: boolean;
  allowCanvasNav: boolean;
  allowNavigateToCanvas: (canvasId: string) => boolean;
  allowDeleteMachine: (machineId: string) => boolean;
  allowDeleteFactory: (factoryId: string) => boolean;
  allowPortReorder: (machineFrameId: string) => boolean;
  allowNodeDrag: boolean;
  allowEdgeContextMenu: boolean;
  pickerConstraint: TutorialPickerConstraint | null;
  requiredLinkOriginPortId: string | null;
};

const NO_GATES: TutorialGates = {
  allowPaneRecipePicker: true,
  allowPortRecipePicker: true,
  allowPortLinkDrag: true,
  allowFreeConnect: true,
  allowMachineContextMenu: true,
  allowFactoryContextMenu: true,
  allowFactoryContextMenuFor: () => true,
  allowFactoryDoubleClick: true,
  allowFactoryOpen: true,
  allowCanvasNav: true,
  allowNavigateToCanvas: () => true,
  allowDeleteMachine: () => true,
  allowDeleteFactory: () => true,
  allowPortReorder: () => true,
  allowNodeDrag: true,
  allowEdgeContextMenu: true,
  pickerConstraint: null,
  requiredLinkOriginPortId: null,
};

function tutorialNavigateAllowed(
  canvasId: string,
  step: TutorialStepId,
  markers: TutorialMarkers,
): boolean {
  const root = markers.tutorialRootCanvasId;
  const nested = markers.nestedFactoryId;
  if (!root) return false;
  if (canvasId === WORLD_CANVAS_ID) return false;
  if (canvasId === root) return step === "navBack";
  if (nested && canvasId === nested) {
    if (step === "enterFactory") return markers.nestedFactoryRenamed;
    return (
      step === "machineInFactory" ||
      step === "nestedFactory"
    );
  }
  return false;
}

export function getTutorialGates(
  active: boolean,
  step: TutorialStepId | null,
  markers: TutorialMarkers,
): TutorialGates {
  if (!active || !step) return NO_GATES;

  const nav = (canvasId: string) => tutorialNavigateAllowed(canvasId, step, markers);

  switch (step) {
    case "welcome":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: false,
        allowPortRecipePicker: false,
        allowPortLinkDrag: false,
        allowFreeConnect: false,
        allowMachineContextMenu: false,
        allowFactoryContextMenu: false,
        allowFactoryDoubleClick: false,
        allowFactoryOpen: false,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        allowDeleteMachine: () => false,
        allowDeleteFactory: () => false,
        allowPortReorder: () => false,
        allowNodeDrag: false,
        allowEdgeContextMenu: false,
      };
    case "placePlate":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: true,
        allowPortRecipePicker: false,
        allowPortLinkDrag: false,
        allowFreeConnect: false,
        allowMachineContextMenu: false,
        allowFactoryContextMenu: false,
        allowFactoryDoubleClick: false,
        allowFactoryOpen: false,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        allowDeleteMachine: () => false,
        allowPortReorder: () => false,
        allowEdgeContextMenu: false,
        pickerConstraint: {
          allowedRecipeKeys: [RECIPE_IRON_PLATE],
          prioritizeRecipeKey: RECIPE_IRON_PLATE,
          allowedMachineKeys: [MACHINE_CONSTRUCTOR],
          lockTab: "machines",
          hideSearchAndFilters: true,
        },
      };
    case "placeSmelter":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: false,
        allowPortRecipePicker: true,
        allowPortLinkDrag: true,
        allowFreeConnect: false,
        allowMachineContextMenu: false,
        allowFactoryContextMenu: false,
        allowFactoryDoubleClick: false,
        allowFactoryOpen: false,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        allowDeleteMachine: () => false,
        allowPortReorder: () => false,
        allowEdgeContextMenu: false,
        requiredLinkOriginPortId: markers.plateIngotPortId,
        pickerConstraint: {
          allowedRecipeKeys: [RECIPE_IRON_INGOT],
          prioritizeRecipeKey: RECIPE_IRON_INGOT,
          allowedMachineKeys: [MACHINE_SMELTER],
          lockTab: "machines",
          hideSearchAndFilters: true,
        },
      };
    case "deletePlate":
      return {
        ...NO_GATES,
        allowMachineContextMenu: true,
        allowDeleteMachine: (id) => id === markers.plateMachineId,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
      };
    case "connectFoundry":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: false,
        allowPortRecipePicker: true,
        allowPortLinkDrag: true,
        allowFreeConnect: false,
        allowMachineContextMenu: false,
        allowFactoryContextMenu: false,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        allowDeleteMachine: () => false,
        allowPortReorder: () => false,
        allowEdgeContextMenu: false,
        requiredLinkOriginPortId: markers.smelterIngotOutPortId,
        pickerConstraint: {
          allowedRecipeKeys: [RECIPE_SOLID_STEEL],
          prioritizeRecipeKey: RECIPE_SOLID_STEEL,
          allowedMachineKeys: [MACHINE_FOUNDRY],
          lockTab: "machines",
          hideSearchAndFilters: true,
        },
      };
    case "reorderFoundry":
      return {
        ...NO_GATES,
        allowPortReorder: (id) => id === markers.foundryMachineId,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
      };
    case "createFactory":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: true,
        allowPortRecipePicker: false,
        allowPortLinkDrag: false,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        pickerConstraint: {
          onlyMiscTab: true,
          lockTab: "misc",
          hideSearchAndFilters: true,
        },
      };
    case "renameFactory":
      return {
        ...NO_GATES,
        allowFactoryContextMenu: true,
        allowFactoryContextMenuFor: (id) => id === markers.nestedFactoryId,
        allowFactoryDoubleClick: false,
        allowFactoryOpen: false,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
      };
    case "enterFactory":
      return {
        ...NO_GATES,
        allowFactoryContextMenu: true,
        allowFactoryContextMenuFor: (id) => id === markers.nestedFactoryId,
        allowFactoryDoubleClick: markers.nestedFactoryRenamed,
        allowFactoryOpen: markers.nestedFactoryRenamed,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
      };
    case "machineInFactory":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: true,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        allowDeleteFactory: () => false,
      };
    case "nestedFactory":
      return {
        ...NO_GATES,
        allowPaneRecipePicker: true,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
        pickerConstraint: {
          onlyMiscTab: true,
          lockTab: "misc",
          hideSearchAndFilters: true,
        },
      };
    case "navBack":
      return {
        ...NO_GATES,
        allowCanvasNav: true,
        allowNavigateToCanvas: nav,
      };
    case "deleteFactory":
      return {
        ...NO_GATES,
        allowFactoryContextMenu: true,
        allowFactoryContextMenuFor: (id) => id === markers.nestedFactoryId,
        allowDeleteFactory: (id) => id === markers.nestedFactoryId,
        allowCanvasNav: false,
        allowNavigateToCanvas: nav,
      };
    case "complete":
      return NO_GATES;
    default:
      return NO_GATES;
  }
}
