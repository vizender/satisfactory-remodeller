import { clampClockPercent, clockMultiplier } from "@/lib/clockSpeed";
import type { MachineFrameData } from "@/types/graph";

/** Recipe solver units; physical machine count and clock are resolved afterwards. */
export function solverClockMultiplier(data: MachineFrameData): number {
  return data.operatingMode === "count"
    ? 1
    : clockMultiplier(data.clockPercent);
}

export function resolveOperatingPoint(
  data: MachineFrameData,
  throughput: number,
) {
  const required = Math.max(0, throughput);
  if (data.operatingMode === "count") {
    const requested = Number.isFinite(data.machineCount)
      ? Math.max(0, data.machineCount!)
      : 1;
    const count = Math.max(requested, required / 2.5);
    return {
      count,
      clock: count > 0 ? Math.min(250, (required / count) * 100) : 0,
    };
  }
  const clock = clampClockPercent(data.clockPercent);
  return { count: clock > 0 ? required / (clock / 100) : 0, clock };
}
