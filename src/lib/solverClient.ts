import type { SolverRequest, SolverResponse } from "@/types/solver-messages";

export function createSolverWorker(): Worker {
  return new Worker(new URL("../workers/solver.worker.ts", import.meta.url), {
    type: "module",
  });
}

export function pingSolver(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("solver ping timeout")), 5000);
    const onMessage = (ev: MessageEvent<SolverResponse>) => {
      if (ev.data.type === "pong") {
        clearTimeout(t);
        worker.removeEventListener("message", onMessage);
        resolve();
      }
    };
    worker.addEventListener("message", onMessage);
    const req: SolverRequest = { type: "ping" };
    worker.postMessage(req);
  });
}
