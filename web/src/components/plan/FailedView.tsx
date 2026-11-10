import { TriangleAlert } from "lucide-react";
import type { PlanDraftRecord } from "@madplan/domain";

type Props = {
  draft: PlanDraftRecord;
  busy: boolean;
  onRetry: () => void;
  onUseLocal: () => void;
  onDiscard: () => void;
};

/** The planner could not finish: say why in Danish and offer a way forward. */
export function FailedView({ draft, busy, onRetry, onUseLocal, onDiscard }: Props) {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised text-offer">
        <TriangleAlert size={26} aria-hidden="true" />
      </span>
      <div role="alert" className="flex max-w-[460px] flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] font-bold leading-tight">Forslaget blev ikke lavet</h1>
        <p className="m-0 text-base leading-relaxed text-ink-2">
          {draft.error ?? "Noget gik galt, mens forslaget blev lavet."}
        </p>
      </div>
      <div className="flex w-full max-w-[360px] flex-col gap-2">
        <button type="button" disabled={busy} onClick={onRetry} className="h-14 rounded-full bg-accent text-base font-semibold text-on-accent disabled:opacity-60">
          Prøv igen
        </button>
        {draft.request.engine === "ai" ? (
          <button type="button" disabled={busy} onClick={onUseLocal} className="h-12 rounded-full border border-line text-[15px] font-medium text-ink-2 disabled:opacity-50">
            Brug hurtigt forslag i stedet
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={onDiscard} className="h-11 rounded-full text-[15px] font-medium text-danger">
          Kassér kladde
        </button>
      </div>
    </main>
  );
}
