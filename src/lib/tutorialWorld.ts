import { collectDescendantCanvasIds } from "@/lib/canvasTree";
import { flushAndPersistWorldDraft } from "@/lib/persistWorldDraft";
import type { FactoryDocumentV2 } from "@/types/factoryDocument";
import { useWorldStore } from "@/store/useWorldStore";
import { TUTORIAL_ROOT_FACTORY_LABEL } from "@/tutorial/constants";
import { WORLD_CANVAS_ID } from "@/types/canvas";
import type { FactoryFrameData } from "@/types/graph";

const TUTORIAL_FACTORY_POSITION = { x: 64, y: 64 };

/**
 * Crée une usine « Tutoriel » vide sur le plan Monde et y entre.
 * Retourne l’id de l’usine ( = id du canvas enfant).
 */
export function setupTutorialSandbox(): string | null {
  const world = useWorldStore.getState();
  world.flushActiveCanvas();

  if (world.activeCanvasId !== WORLD_CANVAS_ID) {
    world.loadCanvasIntoDocument(WORLD_CANVAS_ID);
    useWorldStore.setState({ activeCanvasId: WORLD_CANVAS_ID });
  }

  const factoryId = world.addFactory(TUTORIAL_FACTORY_POSITION);
  if (!factoryId) return null;

  world.renameFactory(factoryId, TUTORIAL_ROOT_FACTORY_LABEL);
  void world.navigateToCanvas(factoryId);
  return factoryId;
}

/** Retire les usines « Tutorial » d’un document sauvegardé (rechargement après tutoriel terminé). */
export function scrubTutorialFactoriesFromDocument(
  doc: FactoryDocumentV2,
): FactoryDocumentV2 {
  const world = doc.canvases[WORLD_CANVAS_ID];
  if (!world) return doc;

  const tutorialRootIds: string[] = [];
  for (const n of world.nodes) {
    if (n.type !== "factoryFrame") continue;
    const label = (n.data as FactoryFrameData | undefined)?.label ?? "";
    if (label.trim() === TUTORIAL_ROOT_FACTORY_LABEL) {
      tutorialRootIds.push(n.id);
    }
  }
  if (tutorialRootIds.length === 0) return doc;

  const canvases = { ...doc.canvases };
  for (const rootId of tutorialRootIds) {
    for (const id of collectDescendantCanvasIds(canvases, rootId)) {
      delete canvases[id];
    }
    const w = canvases[WORLD_CANVAS_ID];
    if (w) {
      canvases[WORLD_CANVAS_ID] = {
        ...w,
        nodes: w.nodes.filter((n) => !tutorialRootIds.includes(n.id)),
      };
    }
  }
  return { ...doc, canvases };
}

/** Supprime l’usine tutoriel, revient au plan Monde et persiste le brouillon. */
export function teardownTutorialSandbox(tutorialRootCanvasId: string | null): void {
  if (!tutorialRootCanvasId) return;
  const world = useWorldStore.getState();
  const map = world.canvasMap;
  if (!map[tutorialRootCanvasId]) return;

  world.removeFactory(tutorialRootCanvasId);

  if (useWorldStore.getState().activeCanvasId !== WORLD_CANVAS_ID) {
    world.loadCanvasIntoDocument(WORLD_CANVAS_ID);
    useWorldStore.setState({ activeCanvasId: WORLD_CANVAS_ID });
  }

  flushAndPersistWorldDraft();
}
