import { useRef } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ReactFlowProvider } from "@xyflow/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FlowCanvas } from "@/components/FlowCanvas";
import { CanvasNavDropdown } from "@/components/CanvasNavDropdown";
import { RigidPortSnapToggle } from "@/components/RigidPortSnapToggle";
import { SettingsMenu } from "@/components/SettingsMenu";
import { MobileUnsupportedGate } from "@/components/MobileUnsupportedGate";
import { SummaryPanel } from "@/components/SummaryPanel";
import { I18nProvider } from "@/i18n/I18nProvider";
import { useLocalDraft } from "@/hooks/useLocalDraft";
import { TutorialController } from "@/components/TutorialController";
import { InputModalityProvider } from "@/hooks/useInputModality";
import {
  handleSuppressNativeContextMenu,
  useSuppressNativeContextMenu,
} from "@/hooks/useSuppressNativeContextMenu";

/** Desktop Tauri shell — no web analytics. */
function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/** Subpath for Vercel Analytics when `base` is not `/` (unused at root deploy). */
const vercelAnalyticsBasePath =
  import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  useSuppressNativeContextMenu(mainRef);
  const draftReady = useLocalDraft();

  return (
    <MobileUnsupportedGate>
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Satisfactory : Remodeller
          </h1>
          <CanvasNavDropdown />
          <RigidPortSnapToggle />
        </div>
        <SettingsMenu />
      </header>
      <div className="flex min-h-0 flex-1">
        <ReactFlowProvider>
          <main
            ref={mainRef}
            className="min-h-0 min-w-0 flex-1"
            onContextMenu={(e) =>
              handleSuppressNativeContextMenu(e, mainRef.current)
            }
          >
            <FlowCanvas />
          </main>
        </ReactFlowProvider>
        <SummaryPanel />
      </div>
      {draftReady ? <TutorialController draftReady /> : null}
    </div>
    </MobileUnsupportedGate>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <InputModalityProvider>
          <AppShell />
        </InputModalityProvider>
      </I18nProvider>
      {!isTauriRuntime() ? (
        <>
          <Analytics
            basePath={vercelAnalyticsBasePath}
            mode={import.meta.env.PROD ? "production" : "development"}
          />
          <SpeedInsights />
        </>
      ) : null}
    </ErrorBoundary>
  );
}

export default App;
