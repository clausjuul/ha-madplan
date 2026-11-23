import { Link } from "react-router";
import { RefreshCw, Sparkles, WifiOff } from "lucide-react";
import { ApiRequestError } from "@/api/client";
import { routePath } from "@/lib/route";

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

/** First visit: plan the first week, or bring the old madplan along. */
export function EmptyStart() {
  return (
    <section aria-labelledby="empty-start" className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <div>
        <h2 id="empty-start" className="font-display m-0 text-lg font-bold">
          Kom i gang med madplanen
        </h2>
        <p className="mb-0 mt-1 text-[15px] leading-snug text-ink-2">
          Lad Madplan foreslå jeres første uge ud fra retterne og jeres ønsker. Bagefter kommer indkøbslisten af sig selv.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={routePath({ name: "planlaeg" })}
          className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent no-underline"
        >
          <Sparkles size={18} aria-hidden="true" />
          Planlæg ugen
        </Link>
        <Link
          to={routePath({ name: "indstillinger", tab: "data" })}
          className="flex min-h-11 items-center rounded-full border border-line px-5 text-[15px] font-semibold text-ink no-underline"
        >
          Importér fra den gamle madplan
        </Link>
      </div>
    </section>
  );
}
