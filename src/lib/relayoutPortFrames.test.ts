import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { MACHINE_LAYOUT } from "@/constants/machineLayout";
import {
  inputPortX,
  outputPortX,
  PORT_FRAME_W,
  relayoutPortFrames,
} from "./relayoutPortFrames";

const { PORT_W, BODY_W, GUTTER } = MACHINE_LAYOUT;

const BODY_LEFT = PORT_W + GUTTER;
const BODY_RIGHT = BODY_LEFT + BODY_W;

function port(
  id: string,
  parentId: string,
  kind: "in" | "out",
  x: number,
): Node {
  return {
    id,
    type: "itemPort",
    parentId,
    position: { x, y: 16 },
    data: { kind, portIndex: 0, itemId: "x", displayName: "x", perMinute: 0, amountPerCraft: 1, slotsOnSide: 1 },
  };
}

describe("relayoutPortFrames", () => {
  it("keeps port cards flush with the machine body", () => {
    expect(inputPortX() + PORT_W).toBe(BODY_LEFT);
    expect(outputPortX()).toBe(BODY_RIGHT);
    expect(PORT_FRAME_W).toBe(BODY_RIGHT + PORT_W + GUTTER);
  });

  it("moves pre-1.4.3 ports onto the current frame", () => {
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
    expect(inn.position.x).toBe(GUTTER);
    expect(outp.position.x).toBe(PORT_FRAME_W - PORT_W - GUTTER);
    expect(inn.position.x + PORT_W).toBe(BODY_LEFT);
    expect(outp.position.x).toBe(BODY_RIGHT);
  });

  it("is idempotent once ports are already current", () => {
    const nodes: Node[] = [
      {
        id: "c1",
        type: "containerFrame",
        position: { x: 10, y: 10 },
        style: { width: PORT_FRAME_W, height: 208 },
        data: { label: "Storage", variant: "standard" },
      },
      port("c1-in-0", "c1", "in", GUTTER),
      port("c1-out-0", "c1", "out", outputPortX()),
    ];
    expect(relayoutPortFrames(nodes)).toBe(nodes);
  });
});
