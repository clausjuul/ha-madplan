import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { eatenHistory, lastEatenByDish, parseDateKey, weekdayName, type BootstrapResponse, type PlanDraftRecord } from "@madplan/domain";
import type { DraftActions } from "@/api/draft-mutations";
import { useIsWide } from "@/hooks/use-media";
import { dishOfDay, engineLabel, draftDayBadge, summarizeDraft } from "@/lib/draft-summary";
import { DishPickerSheet } from "@/components/week/sheets/DishPickerSheet";
import { ConfirmSheet } from "./ConfirmSheet";
import { ReviewRow } from "./ReviewRow";
import { ChecksCard, SummaryCard } from "./ReviewSummary";

type Props = {
  draft: PlanDraftRecord;
  data: BootstrapResponse;
  today: string;
  actions: DraftActions;
  onApply: () => void;
  onDiscard: () => void;
};

/** Step 3: review the draft day by day, then save it into the week plan. */
export function ReviewStep({ draft, data, today, actions, onApply, onDiscard }: Props) {
  const wide = useIsWide();
  const [pickDate, setPickDate] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const summary = useMemo(() => summarizeDraft(draft, data, today), [draft, data, today]);
  const lastEaten = useMemo(() => lastEatenByDish(eatenHistory(data.meals, today)), [data.meals, today]);
  const dishes = useMemo(() => [...data.dishes, ...draft.days.flatMap((day) => (day.newDish ? [day.newDish] : []))], [data.dishes, draft.days]);
  const unlocked = draft.days.filter((day) => !day.locked).map((day) => day.date);
  const pickLabel = pickDate ? `${weekdayName(pickDate, "long")} ${parseDateKey(pickDate).getDate()}.` : "";

  const primary = (
    <button
      type="button"
      disabled={actions.busy || draft.days.length === 0}
      onClick={onApply}
      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-accent text-[17px] font-semibold text-on-accent disabled:opacity-60"
    >
      <Check size={20} strokeWidth={2.4} aria-hidden="true" />
      Gem i ugeplanen
    </button>
  );
  const secondary = (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={actions.busy || unlocked.length === 0}
        onClick={() => void actions.regenerate(draft.id)}
        className="h-12 w-full rounded-full border border-line bg-transparent text-[15px] font-medium text-ink-2 disabled:opacity-50"
      >
        Lav alle ulåste om
      </button>
      <button type="button" onClick={() => setConfirmDiscard(true)} className="h-11 w-full rounded-full text-[15px] font-medium text-danger">
        Kassér kladde
      </button>
    </div>
  );

  const rows = (
    <section aria-label="Forslag pr. dag" className="flex min-h-0 flex-col gap-2.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-display m-0 text-2xl font-bold md:text-[28px]">Forslag til ugen</h1>
        <span className="text-sm text-muted">{engineLabel(draft.engine)} · Lås det, du kan lide, og lav resten om</span>
      </div>
      {draft.days.map((day) => (
        <ReviewRow
          key={day.date}
          day={day}
          dish={dishOfDay(day, dishes)}
          badge={draftDayBadge(day, lastEaten)}
          busy={actions.busy}
          onLock={() => void actions.patchDay(draft.id, day.date, { locked: !day.locked })}
          onRegenerate={() => void actions.regenerate(draft.id, [day.date])}
          onPick={() => setPickDate(day.date)}
        />
      ))}
    </section>
  );

  const sheets = (
    <>
      <DishPickerSheet
        open={pickDate !== null}
        dayLabel={pickLabel}
        dishes={data.dishes}
        meals={data.meals}
        today={today}
        onClose={() => setPickDate(null)}
        onPick={(dishId) => {
          const date = pickDate;
          setPickDate(null);
          if (date) void actions.patchDay(draft.id, date, { dishId });
        }}
      />
      <ConfirmSheet
        open={confirmDiscard}
        title="Kassér kladden?"
        body="Forslaget og dine låsninger bliver slettet. Ugeplanen ændres ikke."
        confirmLabel="Kassér"
        onClose={() => setConfirmDiscard(false)}
        onConfirm={onDiscard}
      />
    </>
  );

  if (wide) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-6 px-8 pb-7 pt-6">
        <div className="min-h-0 overflow-y-auto pr-1">{rows}</div>
        <aside className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
          <SummaryCard summary={summary} />
          <ChecksCard review={draft.review} />
          <div className="flex-1" />
          {primary}
          {secondary}
        </aside>
        {sheets}
      </div>
    );
  }
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-4 [&>*]:shrink-0">
        {rows}
        <SummaryCard summary={summary} />
        <ChecksCard review={draft.review} />
        {secondary}
      </div>
      <div className="shrink-0 border-t border-hairline bg-ground px-4 pb-4 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {primary}
      </div>
      {sheets}
    </>
  );
}
