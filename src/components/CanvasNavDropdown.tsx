import { useEffect, useMemo, useRef, useState } from "react";
import { DestructiveConfirmDialog } from "@/components/DestructiveConfirmDialog";
import { useTutorialGates } from "@/hooks/useTutorialGates";
import { useI18n } from "@/i18n/I18nProvider";
import { getBreadcrumbPath } from "@/lib/canvasTree";
import { useTutorialStore } from "@/store/useTutorialStore";
import { useWorldStore } from "@/store/useWorldStore";
import { WORLD_CANVAS_ID, WORLD_CANVAS_NAME } from "@/types/canvas";

export function CanvasNavDropdown() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeCanvasId = useWorldStore((s) => s.activeCanvasId);
  const canvasMap = useWorldStore((s) => s.canvasMap);
  const navigateToCanvas = useWorldStore((s) => s.navigateToCanvas);
  const renameActiveCanvas = useWorldStore((s) => s.renameActiveCanvas);
  const clearActiveCanvas = useWorldStore((s) => s.clearActiveCanvas);
  const tutorialGates = useTutorialGates();
  const tutorialActive = useTutorialStore((s) => s.active);

  const activeName = useMemo(() => {
    if (activeCanvasId === WORLD_CANVAS_ID) return WORLD_CANVAS_NAME;
    return canvasMap[activeCanvasId]?.name ?? WORLD_CANVAS_NAME;
  }, [activeCanvasId, canvasMap]);

  const breadcrumb = useMemo(
    () => getBreadcrumbPath(canvasMap, activeCanvasId),
    [canvasMap, activeCanvasId],
  );

  const isWorld = activeCanvasId === WORLD_CANVAS_ID;

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

  const startRename = () => {
    if (isWorld) return;
    setRenameValue(activeName);
    setRenameOpen(true);
    setOpen(false);
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    renameActiveCanvas(trimmed);
    if (trimmed && activeCanvasId !== WORLD_CANVAS_ID) {
      useTutorialStore
        .getState()
        .onFactoryRenamed(activeCanvasId, trimmed);
    }
    setRenameOpen(false);
  };

  return (
    <>
      <div ref={rootRef} className="relative min-w-0">
        <button
          type="button"
          className="flex max-w-[min(240px,40vw)] items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:border-[var(--accent)]/40"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => {
            if (tutorialActive && !tutorialGates.allowCanvasNav) return;
            setOpen((o) => !o);
          }}
        >
          <span className="truncate">{activeName}</span>
          <span className="text-[var(--muted)]" aria-hidden>
            ▾
          </span>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute left-0 top-full z-[10002] mt-1 w-[min(280px,calc(100vw-2rem))] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl"
          >
            <span className="mb-2 block px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("factoryNavTitle")}
            </span>
            <nav className="max-h-48 overflow-y-auto">
              {breadcrumb.map((item) => {
                const navAllowed =
                  !tutorialActive ||
                  tutorialGates.allowNavigateToCanvas(item.canvasId);
                return (
                  <button
                    key={item.canvasId}
                    type="button"
                    disabled={!navAllowed}
                    className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                      !navAllowed
                        ? "cursor-not-allowed opacity-35 text-[var(--muted)]"
                        : "hover:bg-[var(--bg)]"
                    } ${
                      item.canvasId === activeCanvasId
                        ? "bg-[var(--accent)]/10 font-semibold text-[var(--text)]"
                        : "text-[var(--muted)]"
                    }`}
                    style={{ paddingLeft: `${8 + item.depth * 12}px` }}
                    onClick={() => {
                      if (tutorialActive && !navAllowed) return;
                      if (tutorialActive && !tutorialGates.allowCanvasNav) {
                        if (!tutorialGates.allowNavigateToCanvas(item.canvasId)) {
                          return;
                        }
                      }
                      void navigateToCanvas(item.canvasId).then(() => {
                        useTutorialStore.getState().onNavigatedTo(item.canvasId);
                      });
                      setOpen(false);
                    }}
                  >
                    {item.name}
                  </button>
                );
              })}
            </nav>

            {!isWorld && (!tutorialActive || tutorialGates.allowFactoryContextMenu) ? (
              <button
                type="button"
                className="mt-2 block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg)]"
                onClick={startRename}
              >
                {t("factoryRenameMenu")}
              </button>
            ) : null}

            {!tutorialActive ? (
            <button
              type="button"
              className="mt-1 block w-full rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10"
              onClick={() => {
                setClearConfirm(true);
                setOpen(false);
              }}
            >
              {t("factoryClear")}
            </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {renameOpen ? (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              {t("factoryRenameMenu")}
            </h2>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenameOpen(false);
              }}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-xs"
                onClick={() => setRenameOpen(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="rounded border border-[var(--accent)] bg-[var(--accent)]/15 px-3 py-1.5 text-xs font-medium"
                onClick={commitRename}
              >
                {t("confirmRename")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DestructiveConfirmDialog
        open={clearConfirm}
        title={t("factoryClearTitle")}
        body={t("factoryClearBody")}
        confirmLabel={t("factoryClearConfirm")}
        onCancel={() => setClearConfirm(false)}
        onConfirm={() => {
          clearActiveCanvas();
          setClearConfirm(false);
        }}
      />
    </>
  );
}
