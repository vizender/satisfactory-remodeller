import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import { getContainerFrameDimensions } from "@/lib/buildContainerGraph";
import { centeredSingleSlotY, computeVerticalSlotYs } from "@/lib/machinePortLayout";
import {
  inputPortX,
  outputPortX,
  PORT_FRAME_W,
  relayoutPortFrames,
} from "./relayoutPortFrames";

const { PORT_W, BODY_W, GUTTER, FRAME_MIN_H } = MACHINE_LAYOUT;

const BODY_LEFT = PORT_W + GUTTER;
const BODY_RIGHT = BODY_LEFT + BODY_W;

function port(
  id: string,
  parentId: string,
  kind: "in" | "out",
  x: number,
  y = 48,
  slotsOnSide = 1,
  portIndex = 0,
): Node {
  return {
    id,
    type: "itemPort",
    parentId,
    position: { x, y },
    data: {
      kind,
      portIndex,
      itemId: "x",
      displayName: "x",
      perMinute: 0,
      amountPerCraft: 1,
      slotsOnSide,
    },
  };
}

describe("relayoutPortFrames", () => {
  it("keeps port cards flush with the machine body", () => {
    expect(inputPortX() + PORT_W).toBe(BODY_LEFT);
    expect(outputPortX()).toBe(BODY_RIGHT);
    expect(PORT_FRAME_W).toBe(BODY_RIGHT + PORT_W + GUTTER);
  });

  it("moves pre-1.4.3 ports onto the current frame and shared Y grid", () => {
    const oldGutter = 6;
    const oldBody = 220;
    const oldFrameW = 96 + oldGutter + oldBody + oldGutter + 96;
    const nodes: Node[] = [
      {
        id: "m1",
        type: "machineFrame",
        position: { x: 0, y: 0 },
        style: { width: oldFrameW, height: 208 },
        data: { label: "Constructor", recipeKey: "r" },
      },
      port("m1-in-0", "m1", "in", oldGutter),
      port("m1-out-0", "m1", "out", oldFrameW - 96 - oldGutter),
    ];

    const out = relayoutPortFrames(nodes);
    const frame = out.find((n) => n.id === "m1")!;
    const inn = out.find((n) => n.id === "m1-in-0")!;
    const outp = out.find((n) => n.id === "m1-out-0")!;

    expect(frame.style?.width).toBe(PORT_FRAME_W);
    expect(frame.style?.height).toBe(FRAME_MIN_H);
    expect(inn.position.x).toBe(GUTTER);
    expect(outp.position.x).toBe(PORT_FRAME_W - PORT_W - GUTTER);
    expect(inn.position.x + PORT_W).toBe(BODY_LEFT);
    expect(outp.position.x).toBe(BODY_RIGHT);
    expect(inn.position.y).toBe(centeredSingleSlotY(FRAME_MIN_H));
    expect(outp.position.y).toBe(centeredSingleSlotY(FRAME_MIN_H));
  });

  it("keeps a 2-port column top-aligned and centers a lone port", () => {
    const nodes: Node[] = [
      {
        id: "m1",
        type: "machineFrame",
        position: { x: 0, y: 0 },
        style: { width: PORT_FRAME_W, height: FRAME_MIN_H },
        data: { label: "A", recipeKey: "r" },
      },
      port("m1-out-0", "m1", "out", 50, 80, 1, 0),
      {
        id: "m2",
        type: "machineFrame",
        position: { x: 400, y: 0 },
        style: { width: PORT_FRAME_W, height: 400 },
        data: {
          label: "B",
          recipeKey: "r",
          outputSlotByRecipeIndex: [0, 1],
        },
      },
      port("m2-out-0", "m2", "out", 50, 90, 2, 0),
      port("m2-out-1", "m2", "out", 50, 200, 2, 1),
    ];
    const out = relayoutPortFrames(nodes);
    const two = computeVerticalSlotYs(2, FRAME_MIN_H);
    expect(out.find((n) => n.id === "m1-out-0")!.position.y).toBe(
      centeredSingleSlotY(FRAME_MIN_H),
    );
    expect(out.find((n) => n.id === "m2-out-0")!.position.y).toBe(two[0]);
    expect(out.find((n) => n.id === "m2-out-1")!.position.y).toBe(two[1]);
  });

  it("is idempotent once ports are already current", () => {
    const { frameH } = getContainerFrameDimensions("standard");
    const nodes: Node[] = [
      {
        id: "c1",
        type: "containerFrame",
        position: { x: 10, y: 10 },
        style: { width: PORT_FRAME_W, height: frameH },
        data: { label: "Storage", variant: "standard" },
      },
      port("c1-in-0", "c1", "in", GUTTER, centeredSingleSlotY(frameH)),
      port("c1-out-0", "c1", "out", outputPortX(), centeredSingleSlotY(frameH)),
    ];
    expect(relayoutPortFrames(nodes)).toBe(nodes);
  });
});
