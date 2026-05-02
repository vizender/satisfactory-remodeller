/**
 * Solveur de flux (placeholder). Les calculs lourds iront ici pour ne pas bloquer l’UI.
 */
import type { SolverRequest, SolverResponse } from "@/types/solver-messages";

self.onmessage = (ev: MessageEvent<SolverRequest>) => {
  const msg = ev.data;
  if (msg.type === "ping") {
    const res: SolverResponse = { type: "pong" };
    self.postMessage(res);
    return;
  }
  if (msg.type === "solve") {
    const res: SolverResponse = {
      type: "solve-result",
      payload: { ok: true, note: "solver not implemented" },
    };
    self.postMessage(res);
  }
};
