import { useDocumentStore } from "@/store/useDocumentStore";
import type { ItemPortData, MachineFrameData } from "@/types/graph";

export function findMachinePortId(
  frameId: string,
  kind: "in" | "out",
  itemId: string,
): string | null {
  const nodes = useDocumentStore.getState().nodes;
  for (const n of nodes) {
    if (n.parentId !== frameId || n.type !== "itemPort") continue;
    const d = n.data as ItemPortData;
    if (d.kind === kind && d.itemId === itemId) return n.id;
  }
  return null;
}

export function findMachineByRecipe(recipeKey: string): string | null {
  const nodes = useDocumentStore.getState().nodes;
  for (const n of nodes) {
    if (n.type !== "machineFrame") continue;
    if ((n.data as MachineFrameData).recipeKey === recipeKey) return n.id;
  }
  return null;
}
