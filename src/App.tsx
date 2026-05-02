import { ReactFlowProvider } from "@xyflow/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FlowCanvas } from "@/components/FlowCanvas";
import { SummaryPanel } from "@/components/SummaryPanel";
import { FlowSolveProvider } from "@/context/FlowSolveContext";

function App() {
  return (
    <ErrorBoundary>
      <FlowSolveProvider>
        <div className="flex h-full flex-col">
          <header className="flex h-12 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-4">
            <h1 className="text-sm font-semibold tracking-tight">
              Satisfactory : Remodeller
            </h1>
            <span className="ml-3 text-xs text-[var(--muted)]">
              Tauri · React Flow · Zustand
            </span>
          </header>
          <div className="flex min-h-0 flex-1">
            <ReactFlowProvider>
              <main className="min-h-0 min-w-0 flex-1">
                <FlowCanvas />
              </main>
            </ReactFlowProvider>
            <SummaryPanel />
          </div>
        </div>
      </FlowSolveProvider>
    </ErrorBoundary>
  );
}

export default App;
