import { describe, expect, it } from "vitest";
import { MACHINE_SNAP_GRID } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  alignFrameHeight,
  computeVerticalSlotYs,
} from "./machinePortLayout";

const { PORT_STACK_STEP, PORT_W, PORT_ROW, BODY_W, GUTTER } = MACHINE_LAYOUT;

function onGrid(n: number): boolean {
  return n % MACHINE_SNAP_GRID === 0;
}

describe("machine port layout", () => {
  it("uses grid-aligned port size and equal stack step", () => {
    expect(onGrid(PORT_W)).toBe(true);
    expect(onGrid(PORT_ROW)).toBe(true);
    expect(onGrid(PORT_STACK_STEP)).toBe(true);
    expect(onGrid(BODY_W)).toBe(true);
    expect(onGrid(GUTTER)).toBe(true);
    expect(PORT_STACK_STEP).toBeGreaterThanOrEqual(PORT_ROW);
  });

  it("places every slot on the grid with equal spacing", () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const frameH = alignFrameHeight(0, count);
      expect(onGrid(frameH)).toBe(true);
      const ys = computeVerticalSlotYs(count, frameH);
      expect(ys).toHaveLength(count);
      for (const y of ys) expect(onGrid(y)).toBe(true);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]! - ys[i - 1]!).toBe(PORT_STACK_STEP);
      }
    }
  });

  it("keeps slots on-grid when the body makes the frame taller", () => {
    const frameH = alignFrameHeight(400, 3);
    expect(frameH).toBeGreaterThanOrEqual(400);
    expect(onGrid(frameH)).toBe(true);
    const ys = computeVerticalSlotYs(3, frameH);
    expect(ys).toHaveLength(3);
    for (const y of ys) expect(onGrid(y)).toBe(true);
    expect(ys[1]! - ys[0]!).toBe(PORT_STACK_STEP);
    expect(ys[2]! - ys[1]!).toBe(PORT_STACK_STEP);
  });
});
