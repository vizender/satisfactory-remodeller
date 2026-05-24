import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/messages";
import {
  useInputModality,
  type InputModalityPreference,
} from "@/hooks/useInputModality";
import {
  downloadFactoryJson,
  exportFilename,
  parseFactoryDocumentJson,
} from "@/lib/factoryDocument";
import { isCanvasSubtreeExport } from "@/lib/canvasExport";
import { useWorldStore } from "@/store/useWorldStore";

const NAV_OPTIONS: InputModalityPreference[] = ["auto", "trackpad", "mouse"];

export function SettingsMenu() {
  const { locale, setLocale, t } = useI18n();
  const { preference, setPreference, effective } = useInputModality();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const worldFileRef = useRef<HTMLInputElement>(null);
  const factoryFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const navLabel = (v: InputModalityPreference) => {
    if (v === "auto") return t("navAuto");
    if (v === "trackpad") return t("navTrackpad");
    return t("navMouse");
  };

  const navHint = (v: InputModalityPreference) => {
    if (v === "auto") return t("navHintAuto");
    if (v === "trackpad") return t("navHintTrackpad");
    return t("navMouse");
  };

  const menuBtn =
    "block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg)]";
  const sectionTitle =
    "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]";
  const selectCls =
    "w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)]";

  const handleExportWorld = () => {
    const doc = useWorldStore.getState().exportWorld();
    downloadFactoryJson(doc);
    setOpen(false);
  };

  const handleExportCanvas = () => {
    const subtree = useWorldStore.getState().exportActiveSubtree();
    if (!subtree) return;
    const blob = new Blob([JSON.stringify(subtree, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(
      useWorldStore.getState().exportWorld(),
      "factory",
    );
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const handleImportWorld = async (file: File) => {
    try {
      const text = await file.text();
      const doc = parseFactoryDocumentJson(text, {
        invalidJson: t("errorInvalidJson"),
        invalidSchema: t("errorInvalidSchemaV2"),
      });
      useWorldStore.getState().replaceWorldDocument(doc);
      setOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportFactory = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!isCanvasSubtreeExport(parsed)) {
        throw new Error(t("errorInvalidSchemaV2"));
      }
      const center = { x: 120, y: 120 };
      const id = useWorldStore.getState().importFactorySubtree(parsed, center);
      if (!id) alert(t("factoryDepthLimit"));
      setOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const activeCanvasId = useWorldStore((s) => s.activeCanvasId);
  const canExportCanvas = activeCanvasId !== "world";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:border-[var(--accent)]/50"
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("settings")}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[10002] mt-1 w-[min(100vw-2rem,300px)] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
        >
          <section className="mb-4">
            <h3 className={sectionTitle}>{t("settingsLanguage")}</h3>
            <div className="flex gap-2">
              {(["fr", "en"] as Locale[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === code}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs ${
                    locale === code
                      ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                  onClick={() => setLocale(code)}
                >
                  {code === "fr" ? t("langFr") : t("langEn")}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-4">
            <h3 className={sectionTitle}>{t("settingsNavigation")}</h3>
            <select
              className={selectCls}
              value={preference}
              title={navHint(preference)}
              onChange={(e) =>
                setPreference(e.target.value as InputModalityPreference)
              }
            >
              {NAV_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {navLabel(v)}
                </option>
              ))}
            </select>
            {preference === "auto" ? (
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                ({effective === "trackpad"
                  ? t("navDetectedTrackpad")
                  : t("navDetectedMouse")}
                )
              </p>
            ) : null}
          </section>

          <section className="mb-4">
            <h3 className={sectionTitle}>{t("settingsData")}</h3>
            <div className="flex flex-col gap-1">
              <button type="button" className={menuBtn} onClick={handleExportWorld}>
                {t("exportWorldJson")}
              </button>
              <button
                type="button"
                className={menuBtn}
                disabled={!canExportCanvas}
                onClick={handleExportCanvas}
              >
                {t("exportFactoryJson")}
              </button>
              <button
                type="button"
                className={menuBtn}
                onClick={() => worldFileRef.current?.click()}
              >
                {t("importWorldJson")}
              </button>
              <button
                type="button"
                className={menuBtn}
                onClick={() => factoryFileRef.current?.click()}
              >
                {t("importFactoryJson")}
              </button>
            </div>
            <input
              ref={worldFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleImportWorld(f);
              }}
            />
            <input
              ref={factoryFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleImportFactory(f);
              }}
            />
          </section>

          <section>
            <h3 className={sectionTitle}>{t("settingsAutoSave")}</h3>
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              {t("settingsAutoSaveBody")}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
