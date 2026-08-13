type Listener = () => void;

/** Selection for display-only shared routing segments (rs-*). */
let selectedIds = new Set<string>();
const listeners = new Set<Listener>();
let version = 0;

function notify() {
  version += 1;
  for (const l of listeners) l();
}

export function subscribeSegmentSelection(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getSegmentSelectionVersion(): number {
  return version;
}

export function getSelectedSegmentIds(): ReadonlySet<string> {
  return selectedIds;
}

export function isSegmentSelected(id: string): boolean {
  return selectedIds.has(id);
}

/** Solo-select one segment (clears any previous selection). */
export function replaceSegmentSelection(id: string): void {
  if (selectedIds.size === 1 && selectedIds.has(id)) return;
  selectedIds = new Set([id]);
  notify();
}

/** Shift-add (or shift-toggle) a segment into the selection. */
export function toggleSegmentInSelection(id: string): void {
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds = next;
  notify();
}

/** Keep current multi-selection as-is (e.g. dragging an already-selected member). */
export function ensureSegmentSelected(id: string): void {
  if (selectedIds.has(id)) return;
  const next = new Set(selectedIds);
  next.add(id);
  selectedIds = next;
  notify();
}

export function clearSegmentSelection(): void {
  if (selectedIds.size === 0) return;
  selectedIds = new Set();
  notify();
}

export function setSegmentSelectionFromIds(ids: Iterable<string>): void {
  selectedIds = new Set(ids);
  notify();
}
