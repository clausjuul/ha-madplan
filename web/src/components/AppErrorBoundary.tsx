import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { isChunkLoadError, reloadOnce } from "@/lib/reload-once";

type State = { error: unknown };

/**
 * Last line of defence: a render error anywhere would otherwise unmount the whole tree and
 * leave a blank page. A missing chunk after an update reloads once; anything else shows the
 * error with a reload button.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Madplan stoppede med en fejl", error, info.componentStack);
    if (isChunkLoadError(error)) reloadOnce();
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const detail = error instanceof Error ? error.message : String(error);
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-[460px] flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised text-offer">
          <TriangleAlert size={26} aria-hidden="true" />
        </span>
        <h1 className="font-display m-0 text-2xl font-bold">Madplan stoppede uventet</h1>
        <p className="m-0 text-[15px] leading-relaxed text-ink-2">
          Prøv at genindlæse. Hvis det sker igen, så send fejlteksten herunder videre.
        </p>
        <code className="max-w-full break-words rounded-xl bg-raised px-3 py-2 text-left text-[13px] text-ink-2">{detail}</code>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent"
        >
          <RefreshCw size={18} aria-hidden="true" />
          Genindlæs
        </button>
      </div>
    );
  }
}
