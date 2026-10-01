import { useWorldStore } from "@/store/useWorldStore";
import { useDocumentStore } from "@/store/useDocumentStore";
import { computeFactoryHierarchy } from "@/lib/factoryHierarchy";

let previous: unknown[] = [];
let cached: ReturnType<typeof computeFactoryHierarchy> | undefined;
export function useFactoryHierarchy() {
  const canvases = useWorldStore((s) => s.canvasMap);
  const active = useWorldStore((s) => s.activeCanvasId);
  const library = useWorldStore((s) => s.blueprintLibrary);
  const nodes = useDocumentStore((s) => s.nodes);
  const edges = useDocumentStore((s) => s.edges);
  const forcedPortRates = useDocumentStore((s) => s.forcedPortRates);
  const key = [canvases, active, library, nodes, edges, forcedPortRates];
  if (!cached || key.some((entry, i) => entry !== previous[i])) {
    previous = key;
    cached = computeFactoryHierarchy(
      {
        ...canvases,
        [active]: { ...canvases[active], nodes, edges, forcedPortRates },
      },
      library,
    );
  }
  return cached;
}
