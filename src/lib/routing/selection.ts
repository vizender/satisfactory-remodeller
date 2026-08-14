/** Shift-click adds/removes segments only when they share a net. */
export function nextSegmentSelection(
  current: string[],
  id: string | null,
  segments: { id: string; netId: string }[],
  toggle = false,
): string[] {
  if (id === null) return [];
  const seg = segments.find((s) => s.id === id);
  if (!seg) return current;
  if (!toggle) return [id];
  const first = current[0];
  const currentNet = first
    ? segments.find((s) => s.id === first)?.netId
    : undefined;
  if (currentNet && seg.netId !== currentNet) return [id];
  if (current.includes(id)) return current.filter((x) => x !== id);
  return [...current, id];
}
