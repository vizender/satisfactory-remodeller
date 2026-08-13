import { describe, expect, it } from "vitest";
import {
  clearSegmentSelection,
  getSelectedSegmentIds,
  replaceSegmentSelection,
  toggleSegmentInSelection,
} from "@/lib/segmentSelection";

describe("segmentSelection", () => {
  it("replace clears prior selection", () => {
    clearSegmentSelection();
    replaceSegmentSelection("rs-a");
    replaceSegmentSelection("rs-b");
    expect([...getSelectedSegmentIds()]).toEqual(["rs-b"]);
  });

  it("toggle adds and removes for shift-multi", () => {
    clearSegmentSelection();
    replaceSegmentSelection("rs-a");
    toggleSegmentInSelection("rs-b");
    expect(getSelectedSegmentIds().has("rs-a")).toBe(true);
    expect(getSelectedSegmentIds().has("rs-b")).toBe(true);
    toggleSegmentInSelection("rs-a");
    expect([...getSelectedSegmentIds()]).toEqual(["rs-b"]);
  });
});
