import { blueprintFingerprint } from "@/lib/blueprintFingerprint";
import { resetDisconnectedBoundaries } from "@/lib/factoryBoundaries";
import { useEffect } from "react";
import { useDocumentStore } from "@/store/useDocumentStore";
import { useWorldStore } from "@/store/useWorldStore";

/** Keep derived parent ports and blueprint revisions in the same edit/undo step. */
export function useFactorySynchronization(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return subscribeFactorySynchronization();
  }, [enabled]);
}

export function subscribeFactorySynchronization() {
  let syncing = false;
  return useDocumentStore.subscribe((state, previous) => {
    if (syncing || state.nodes.some((n) => n.dragging)) return;
    if (
      !previous.nodes.some((n) => n.dragging) &&
      state.forcedPortRates === previous.forcedPortRates &&
      state.routeGraph === previous.routeGraph &&
      blueprintFingerprint({
        name: "",
        nodes: state.nodes,
        edges: state.edges,
        forcedPortRates: state.forcedPortRates,
        id: "",
      }) ===
        blueprintFingerprint({
          name: "",
          nodes: previous.nodes,
          edges: previous.edges,
          forcedPortRates: previous.forcedPortRates,
          id: "",
        })
    )
      return;
    syncing = true;
    try {
      if (state.edges !== previous.edges) {
        const nodes = resetDisconnectedBoundaries(state.nodes, state.edges);
        if (nodes !== state.nodes) useDocumentStore.setState({ nodes });
      }
      useWorldStore.getState().flushActiveCanvas();
    } finally {
      syncing = false;
    }
  });
}
