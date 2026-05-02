import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { err: Error | null };

/**
 * Affiche l’exception au lieu d’un écran blanc silencieux (React 19 en prod ne montre pas l’overlay Vite).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("App render error:", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            color: "#fecaca",
            background: "#0f1419",
            minHeight: "100vh",
          }}
        >
          <h1 style={{ fontSize: 16, marginBottom: 8 }}>Erreur de rendu</h1>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              color: "#e2e8f0",
            }}
          >
            {this.state.err.message}
            {this.state.err.stack ? `\n\n${this.state.err.stack}` : ""}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
