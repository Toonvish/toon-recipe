import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Logo } from "./Logo";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Global crash barrier. Renders a German recovery screen instead of a white page
 * and never shows a stack trace to the user (it goes to the console).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ui] Unbehandelter Fehler:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <Logo className="mx-auto size-12" />
          <h1 className="mt-4 text-xl font-semibold text-fg">Da ist etwas schiefgelaufen</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Die App konnte diesen Bereich nicht anzeigen. Versuche es erneut – deine Rezepte sind
            sicher gespeichert.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={this.reset} leftIcon={<RefreshCw className="size-4" />} fullWidth>
              Erneut versuchen
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                window.location.assign("/");
              }}
            >
              Zur Startseite
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
