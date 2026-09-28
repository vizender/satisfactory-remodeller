import { afterEach, expect, it } from "vitest";
import { useDocumentStore } from "@/store/useDocumentStore";
import { applyMachineSelection } from "./machineSelection";
import type { Node } from "@xyflow/react";

const original = useDocumentStore.getState();
afterEach(() => useDocumentStore.setState(original));
const frames = [
  ["m1", "machineFrame"],
  ["m2", "machineFrame"],
  ["c1", "containerFrame"],
  ["c2", "containerFrame"],
  ["f1", "factoryFrame"],
  ["f2", "factoryFrame"],
];
const nodes: Node[] = frames.map(([id, type]) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {},
}));
const selected = () =>
  useDocumentStore
    .getState()
    .nodes.filter((n) => n.selected)
    .map((n) => n.id);

it("adds and removes every frame type even when React Flow replaces selection first", () => {
  useDocumentStore.setState({ nodes });
  const expected = new Set<string>();
  for (const [id] of frames) {
    const before = new Set(selected());
    // Simulate an unmodified selection from React Flow's stale global Shift state.
    useDocumentStore.setState({
      nodes: nodes.map((n) => ({ ...n, selected: n.id === id })),
    });
    applyMachineSelection(id, "toggle", before);
    expected.add(id);
    expect(new Set(selected())).toEqual(expected);
  }
  for (const [id] of frames) {
    const before = new Set(selected());
    useDocumentStore.setState({
      nodes: nodes.map((n) => ({ ...n, selected: n.id === id })),
    });
    applyMachineSelection(id, "toggle", before);
    expected.delete(id);
    expect(new Set(selected())).toEqual(expected);
  }
});

it("does not toggle twice when React Flow already handled Shift correctly", () => {
  useDocumentStore.setState({
    nodes: nodes.map((n) => ({ ...n, selected: n.id.startsWith("c") })),
  });
  applyMachineSelection("c2", "toggle", new Set(["c1"]));
  expect(selected()).toEqual(["c1", "c2"]);
  applyMachineSelection("c1", "replace", new Set(["c1", "c2"]));
  expect(selected()).toEqual(["c1"]);
});
