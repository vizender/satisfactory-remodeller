export type SolverRequest =
  | { type: "ping" }
  | { type: "solve"; payload: unknown };

export type SolverResponse =
  | { type: "pong" }
  | { type: "solve-result"; payload: unknown };
