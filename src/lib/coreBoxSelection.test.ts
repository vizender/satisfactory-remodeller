import { expect, it } from "vitest";
import { boxFromPoints, coreIsInBox } from "./coreBoxSelection";

const core = { left: 100, top: 100, right: 200, bottom: 200 };

it("selects by the core, with full or partial containment", () => {
  const wholeCore = boxFromPoints({ x: 205, y: 205 }, { x: 95, y: 95 });
  const coreCorner = boxFromPoints({ x: 195, y: 195 }, { x: 250, y: 250 });
  const portWingOnly = boxFromPoints({ x: 70, y: 120 }, { x: 99, y: 180 });
  expect(coreIsInBox(wholeCore, core, "full")).toBe(true);
  expect(coreIsInBox(coreCorner, core, "full")).toBe(false);
  expect(coreIsInBox(coreCorner, core, "partial")).toBe(true);
  expect(coreIsInBox(portWingOnly, core, "partial")).toBe(false);
});
