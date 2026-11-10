import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { formatPrice, type CheckStatus, type PlanReview } from "@madplan/domain";
import type { DraftSummary } from "@/lib/draft-summary";

const CARD = "flex flex-col gap-3.5 rounded-3xl bg-surface p-5 md:p-[22px]";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`font-display m-0 mt-0.5 text-[28px] font-bold leading-tight ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

export function SummaryCard({ summary }: { summary: DraftSummary }) {
  return (
    <section aria-labelledby="summary-heading" className={CARD}>
      <h2 id="summary-heading" className="m-0 text-base font-semibold">Sådan ser ugen ud</h2>
      <dl className="m-0 grid grid-cols-2 gap-3.5">
        <Stat label="Retter" value={String(summary.dishCount)} />
        <Stat label="Nye retter" value={String(summary.newDishCount)} tone="text-new" />
        <Stat label="Indkøb, ca." value={summary.estimatedCostDkk > 0 ? formatPrice(summary.estimatedCostDkk) : "–"} />
        <Stat label="Snit, tid" value={summary.averageMinutes === null ? "–" : `${summary.averageMinutes} min`} />
      </dl>
    </section>
  );
}

const ICONS: Record<Exclude<CheckStatus, "skipped">, { icon: typeof Check; tone: string; word: string }> = {
  ok: { icon: Check, tone: "text-ok", word: "I orden" },
  warning: { icon: CircleAlert, tone: "text-offer", word: "Vær opmærksom" },
  violation: { icon: TriangleAlert, tone: "text-danger", word: "Overtrådt" },
};

export function ChecksCard({ review }: { review: PlanReview | null }) {
  const checks = (review?.checks ?? []).filter((check) => check.status !== "skipped");
  if (checks.length === 0) return null;
  return (
    <section aria-labelledby="checks-heading" className={`${CARD} !gap-2.5 md:!py-5`}>
      <h2 id="checks-heading" className="m-0 text-base font-semibold">Tjekket mod jeres regler</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-ink-2">
        {checks.map((check) => {
          if (check.status === "skipped") return null;
          const { icon: Icon, tone, word } = ICONS[check.status];
          return (
            <li key={check.id} className="flex items-start gap-2">
              <span className={`mt-0.5 flex shrink-0 ${tone}`}>
                <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
                <span className="sr-only">{word}: </span>
              </span>
              <span>{check.message}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
