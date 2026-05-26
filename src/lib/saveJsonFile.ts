/** Ensures a safe `.json` file name for download / save dialogs. */
export function sanitizeExportFilename(name: string, fallback = "export"): string {
  const trimmed = name.trim();
  const withoutExt = trimmed.replace(/\.json$/i, "");
  const slug = withoutExt
    .replace(/[^a-zA-Z0-9._\-\s]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const base = slug || fallback;
  return `${base}.json`;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};

function triggerAnchorDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type SaveJsonResult = "saved" | "cancelled";

/**
 * Saves JSON via the native “Save as” dialog when available (pick folder + rename),
 * otherwise prompts for a file name then downloads (browser default folder, usually Downloads).
 */
export async function saveJsonFile(
  data: unknown,
  suggestedFilename: string,
  options?: {
    /** Shown when the Save dialog API is unavailable (prompt fallback). */
    promptLabel?: string;
  },
): Promise<SaveJsonResult> {
  const filename = sanitizeExportFilename(suggestedFilename);
  const json = JSON.stringify(data, null, 2);

  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: "JSON",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      /* Fall through to prompt / anchor download. */
    }
  }

  const label = options?.promptLabel ?? "File name";
  const chosen = window.prompt(label, filename);
  if (chosen === null) return "cancelled";
  triggerAnchorDownload(json, sanitizeExportFilename(chosen, filename));
  return "saved";
}
