/** `f3-out-1` → `f3-in-1` */
export function pairedContainerInputPortId(outPortId: string): string | null {
  const m = /^(.+)-out-(\d+)$/.exec(outPortId);
  return m ? `${m[1]}-in-${m[2]}` : null;
}
