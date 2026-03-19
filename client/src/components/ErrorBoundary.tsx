import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, HelpCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4" data-testid="error-boundary-fallback">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-error-boundary-title">
              Something went wrong
            </h1>
            <p className="text-base text-muted-foreground mb-6 leading-relaxed" data-testid="text-error-boundary-message">
              An unexpected error occurred. Don't worry — your data is safe. Try reloading the page, or reach out if the problem persists.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-all active:scale-[0.98]"
                data-testid="button-reload"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card text-foreground font-bold text-sm hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.98]"
                data-testid="link-error-home"
              >
                <Home className="w-4 h-4" />
                Back to Home
              </a>
            </div>

            <div className="border-t border-border pt-6">
              <a
                href="/contact"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                data-testid="link-error-support"
              >
                <HelpCircle className="w-4 h-4" />
                Need help? Visit our support page
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}