/** Routing metadata stored on XYFlow edge `data` (topology stays source/target). */
export type ItemEdgeData = {
  itemId: string;
  suggested?: boolean;
};

export function isItemEdgeData(data: unknown): data is ItemEdgeData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as ItemEdgeData).itemId === "string"
  );
}
