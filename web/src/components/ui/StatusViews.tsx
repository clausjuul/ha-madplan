import { RefreshCw, WifiOff } from "lucide-react";
import { ApiRequestError } from "@/api/client";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message =
    error instanceof ApiRequestError
      ? error.message
      : "Noget gik galt, og ugen kunne ikke hentes.";
  return (
    <div role="alert" className="mx-auto flex max-w-[420px] flex-col items-center gap-4 px-6 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised text-offer">
        <WifiOff size={26} aria-hidden="true" />
      </span>
      <h2 className="font-display text-2xl font-bold">Vi kunne ikke hente madplanen</h2>
      <p className="text-[15px] leading-relaxed text-ink-2">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent"
      >
        <RefreshCw size={18} aria-hidden="true" />
        Prøv igen
      </button>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-offer-soft px-4 py-2 text-sm font-medium text-offer"
    >
      <WifiOff size={16} aria-hidden="true" />
      Ingen forbindelse. Viser det senest hentede; vi prøver igen automatisk.
    </div>
  );
}

export function ImportOffer() {
  return (
    <a
      href="#/indstillinger"
      className="mx-4 mb-4 flex items-center gap-4 rounded-3xl border border-line bg-surface p-5 text-ink md:mx-0"
    >
      <span className="min-w-0 flex-1">
        <strong className="font-display block text-lg">Din madplan er tom</strong>
        <span className="mt-1 block text-[15px] leading-snug text-ink-2">
          Har du brugt den gamle madplan? Importér dine retter og uger fra den.
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-accent px-5 py-3 text-[15px] font-semibold text-on-accent">
        Importér
      </span>
    </a>
  );
}
