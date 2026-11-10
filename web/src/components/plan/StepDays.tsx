import { useMemo } from "react";
import { addDaysToKey, formatDateRange, type BootstrapResponse } from "@madplan/domain";
import { formDates, gridDates, validateDays, type PlanForm, MAX_DAYS } from "@/lib/plan-form";
import { mondayOf } from "@/lib/route";
import { DayGrid } from "./DayGrid";
import { Stepper, chipClass } from "./Stepper";

type Props = {
  form: PlanForm;
  onChange: (form: PlanForm) => void;
  data: BootstrapResponse;
  today: string;
};

/** Step 1: which days should the plan cover? */
export function StepDays({ form, onChange, data, today }: Props) {
  const dates = useMemo(() => formDates(form, today), [form, today]);
  const grid = useMemo(() => gridDates(form, today), [form, today]);
  const planned = useMemo(() => new Set(dates), [dates]);
  const skipped = useMemo(() => new Set(form.skippedDates), [form.skippedDates]);
  const nextWeek = addDaysToKey(mondayOf(today), 7);
  const first = dates[0];
  const last = dates.at(-1);
  const kept = dates.filter((date) => data.meals[date]?.locked).length;
  const replaced = dates.filter((date) => data.meals[date] && !data.meals[date]?.locked && !data.meals[date]?.skipped).length;
  const check = validateDays(form, today);

  const toggle = (date: string): void =>
    onChange({
      ...form,
      skippedDates: skipped.has(date) ? form.skippedDates.filter((d) => d !== date) : [...form.skippedDates, date],
    });

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6">
      <div>
        <h1 className="font-display m-0 text-[28px] font-bold leading-tight">Hvilke dage skal planlægges?</h1>
        <p className="mb-0 mt-1 text-[15px] text-muted">Tryk på en dato for at springe den over, fx hvis I spiser ude.</p>
      </div>

      <div className="flex flex-col gap-5 rounded-[28px] bg-surface p-5 md:flex-row md:items-end md:gap-8 md:p-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink-2">Start</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={form.from === today} onClick={() => onChange({ ...form, from: today, skippedDates: [] })} className={chipClass(form.from === today)}>
              Fra i dag
            </button>
            <button type="button" aria-pressed={form.from === nextWeek} onClick={() => onChange({ ...form, from: nextWeek, skippedDates: [] })} className={chipClass(form.from === nextWeek)}>
              Næste uge
            </button>
            <label className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] text-ink-2">
              <span className="sr-only md:not-sr-only">Dato</span>
              <input
                type="date"
                aria-label="Startdato"
                min={today}
                value={form.from}
                onChange={(event) => event.target.value && onChange({ ...form, from: event.target.value < today ? today : event.target.value, skippedDates: [] })}
                className="bg-transparent text-ink [color-scheme:inherit]"
              />
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink-2">Antal dage</span>
          <Stepper label="Antal dage" unit="dage" value={form.dayCount} min={1} max={MAX_DAYS} onChange={(dayCount) => onChange({ ...form, dayCount })} />
        </div>
      </div>

      <section aria-labelledby="grid-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="grid-heading" className="m-0 text-base font-semibold">
            {first && last ? formDateSpan(first, last, dates.length) : "Ingen dage valgt"}
          </h2>
          {dates.length > 0 && (kept > 0 || replaced > 0) ? (
            <span className="text-sm text-muted">
              {kept > 0 ? `${kept} låst og bevares` : ""}
              {kept > 0 && replaced > 0 ? " · " : ""}
              {replaced > 0 ? `${replaced} ${replaced === 1 ? "ret erstattes" : "retter erstattes"}` : ""}
            </span>
          ) : null}
        </div>
        <DayGrid dates={grid} planned={planned} skipped={skipped} meals={data.meals} dishes={data.dishes} onToggle={toggle} />
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[13px] text-muted">
          <li>Låste dage bevares altid.</li>
          <li>Dage med en ret, der ikke er låst, bliver erstattet, når du gemmer planen.</li>
        </ul>
        {!check.ok ? (
          <p role="alert" className="m-0 rounded-2xl bg-offer-soft px-4 py-3 text-[15px] text-offer">
            {check.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function formDateSpan(first: string, last: string, count: number): string {
  const range = formatDateRange(first, last);
  return `${count} ${count === 1 ? "dag" : "dage"} · ${range}`;
}
