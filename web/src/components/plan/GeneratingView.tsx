import { motion } from "motion/react";
import type { PlanDraftRecord } from "@madplan/domain";
import { engineLabel } from "@/lib/draft-summary";

type Props = { draft: PlanDraftRecord; busy: boolean; onCancel: () => void };

/** Calm waiting screen while the planner works. No fake progress: we only know it is working. */
export function GeneratingView({ draft, busy, onCancel }: Props) {
  const redo = draft.days.length > 0;
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 text-center" aria-busy="true">
      <div className="flex gap-2.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-3.5 w-3.5 rounded-full bg-accent"
            animate={{ opacity: [0.25, 1, 0.25], scale: [0.85, 1.1, 0.85] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: index * 0.25, ease: "easeInOut" }}
          />
        ))}
      </div>
      <div role="status" className="flex max-w-[460px] flex-col gap-2">
        <h1 className="font-display m-0 text-[28px] font-bold leading-tight">
          {redo ? "Laver de ulåste dage om" : "Laver et forslag til jer"}
        </h1>
        <p className="m-0 text-base leading-relaxed text-ink-2">
          {draft.engine === "ai"
            ? "Assist leder efter retter, der passer til jeres ønsker og regler. Det kan tage lidt over et halvt minut."
            : "Et øjeblik."}
        </p>
        <p className="m-0 text-sm leading-relaxed text-muted">
          Du kan roligt lukke siden. Kladden gemmes, og du kan fortsætte her senere, også på en anden skærm.
        </p>
        <p className="m-0 text-[13px] text-muted">{engineLabel(draft.engine)}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="h-12 rounded-full border border-line px-7 text-[15px] font-medium text-ink-2 disabled:opacity-50"
      >
        Afbryd
      </button>
    </main>
  );
}
