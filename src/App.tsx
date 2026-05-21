import { useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FlowCanvas } from "@/components/FlowCanvas";
import { InputModalityControl } from "@/components/InputModalityControl";
import { SummaryPanel } from "@/components/SummaryPanel";
import { InputModalityProvider } from "@/hooks/useInputModality";
import {
  handleSuppressNativeContextMenu,
  useSuppressNativeContextMenu,
} from "@/hooks/useSuppressNativeContextMenu";

function App() {
  const mainRef = useRef<HTMLElement>(null);
  useSuppressNativeContextMenu(mainRef);

  return (
    <ErrorBoundary>
      <InputModalityProvider>
        <div className="flex h-full flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4">
            <div className="flex min-w-0 items-center">
              <h1 className="truncate text-sm font-semibold tracking-tight">
                Satisfactory : Remodeller
              </h1>
              <span className="ml-3 hidden text-xs text-[var(--muted)] sm:inline">
                Web · React Flow · Zustand
              </span>
            </div>
            <InputModalityControl />
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
        </div>
      </InputModalityProvider>
    </ErrorBoundary>
  );
}

export default App;
