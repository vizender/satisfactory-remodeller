import { describe, expect, it } from "vitest";
import { MACHINE_SNAP_GRID } from "@/constants/flowGrid";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  alignFrameHeight,
  centeredSingleSlotY,
  computeVerticalSlotYs,
  portHandleLocalY,
} from "./machinePortLayout";

const { PORT_STACK_STEP, PORT_W, PORT_ROW, BODY_W, GUTTER, PORT_COL_TOP } =
  MACHINE_LAYOUT;

function onGrid(n: number): boolean {
  return n % MACHINE_SNAP_GRID === 0;
}

describe("machine port layout", () => {
  it("keeps core sizes on the machine grid; gutter may be 0", () => {
    expect(onGrid(PORT_W)).toBe(true);
    expect(onGrid(PORT_ROW)).toBe(true);
    expect(onGrid(PORT_STACK_STEP)).toBe(true);
    expect(onGrid(BODY_W)).toBe(true);
    expect(onGrid(GUTTER)).toBe(true);
    expect(PORT_STACK_STEP).toBeGreaterThanOrEqual(PORT_ROW);
  });

  it("puts stacked handle centers on the 16px grid", () => {
    for (let i = 0; i < 6; i++) {
      expect(onGrid(portHandleLocalY(i))).toBe(true);
    }
    expect(PORT_COL_TOP + PORT_ROW / 2).toBe(portHandleLocalY(0));
  });

  it("centers a lone port and keeps its handle on the 16px grid", () => {
    for (const h of [208, 248, 320, 400]) {
      const y = centeredSingleSlotY(h);
      expect(onGrid(y + PORT_ROW / 2)).toBe(true);
      const ideal = (h - PORT_ROW) / 2;
      expect(Math.abs(y - ideal)).toBeLessThanOrEqual(MACHINE_SNAP_GRID);
    }
  });

  it("centers 1-port columns and top-aligns 2+ columns", () => {
    const h1 = alignFrameHeight(0, 1);
    const h2 = alignFrameHeight(0, 2);
    const one = computeVerticalSlotYs(1, h1);
    const two = computeVerticalSlotYs(2, h2);
    expect(one[0]).toBe(centeredSingleSlotY(h1));
    expect(one[0]).not.toBe(PORT_COL_TOP);
    expect(two[0]).toBe(PORT_COL_TOP);
    expect(two[1]! - two[0]!).toBe(PORT_STACK_STEP);
  });

  it("centers a lone output on a tall 2-input frame", () => {
    const h = alignFrameHeight(0, 2);
    const out = computeVerticalSlotYs(1, h);
    const ins = computeVerticalSlotYs(2, h);
    expect(ins[0]).toBe(PORT_COL_TOP);
    expect(out[0]).toBe(centeredSingleSlotY(h));
    expect(out[0]).toBeGreaterThan(ins[0]!);
    expect(out[0]).toBeLessThan(ins[1]!);
  });

  it("places every multi-slot column with equal spacing", () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const frameH = alignFrameHeight(0, count);
      expect(onGrid(frameH)).toBe(true);
      const ys = computeVerticalSlotYs(count, frameH);
      expect(ys).toHaveLength(count);
      expect(ys[0]).toBe(PORT_COL_TOP);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]! - ys[i - 1]!).toBe(PORT_STACK_STEP);
      }
    }
  });

  it("does not shift the first multi-slot when the body is taller", () => {
    const ys = computeVerticalSlotYs(3, alignFrameHeight(400, 3));
    expect(ys[0]).toBe(PORT_COL_TOP);
    expect(ys[1]! - ys[0]!).toBe(PORT_STACK_STEP);
    expect(ys[2]! - ys[1]!).toBe(PORT_STACK_STEP);
  });
});
