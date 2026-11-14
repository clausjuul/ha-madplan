import { useMemo } from "react";
import type { BootstrapResponse } from "@madplan/domain";
import { MAX_NEW_DISHES, effectiveNewDishCount, PREP_CHOICES, formDates, validateWishes, type PlanForm } from "@/lib/plan-form";
import { ChipInput } from "@/components/ui/ChipInput";
import { DayWishes } from "./DayWishes";
import { EngineChoice } from "./EngineChoice";
import { RequiredDishes } from "./RequiredDishes";
import { Stepper, chipClass } from "./Stepper";

type Props = {
  form: PlanForm;
  onChange: (form: PlanForm) => void;
  data: BootstrapResponse;
  today: string;
};

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[24px] bg-surface p-5">
      <header>
        <h2 className="m-0 text-base font-semibold">{title}</h2>
        {hint ? <p className="mb-0 mt-0.5 text-[13px] leading-snug text-muted">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Step 2: wishes, must-have dishes, limits and the choice of engine. */
export function StepWishes({ form, onChange, data, today }: Props) {
  const dates = useMemo(() => formDates(form, today), [form, today]);
  const check = validateWishes(form, today, data.meals);
  const aiAvailable = data.capabilities.openai;
  const feasibility = { dates, meals: data.meals, requiredDishIds: form.requiredDishIds, newDishCount: effectiveNewDishCount(form) };
  const lockedDishIds = new Set(dates.flatMap((date) => (data.meals[date]?.locked ? [data.meals[date].dishId] : [])));
  const patch = (change: Partial<PlanForm>): void => onChange({ ...form, ...change });
  const input = "w-full rounded-2xl border border-line bg-ground px-4 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent";

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5">
      <h1 className="font-display m-0 text-[28px] font-bold leading-tight">Hvad har I lyst til?</h1>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-4">
          <Card title="Ønsker til ugen" hint="Skriv frit – fx “noget stærkt med nudler” eller “mest hurtig mad”.">
            <textarea
              aria-label="Ønsker til ugen"
              value={form.request}
              maxLength={600}
              rows={3}
              onChange={(event) => patch({ request: event.target.value })}
              placeholder="Fx noget stærkt med nudler, og noget let om fredagen"
              className={`${input} py-3`}
            />
          </Card>
          <Card
            title="Ønsker til bestemte dage"
            hint="Valgfrit. Tryk på en dag for at skrive et ønske. “God tid” betyder, at retten må tage længere tid og koste lidt mere."
          >
            <DayWishes
              dates={dates}
              wishes={form.dayRequests}
              relaxed={form.relaxedDates}
              onChange={(date, wish) => patch({ dayRequests: { ...form.dayRequests, [date]: wish } })}
              onToggleRelaxed={(date) =>
                patch({
                  relaxedDates: form.relaxedDates.includes(date)
                    ? form.relaxedDates.filter((other) => other !== date)
                    : [...form.relaxedDates, date],
                })
              }
            />
          </Card>
          <Card title="Skal med" hint="Retter, der skal være med i planen.">
            <RequiredDishes
              selected={form.requiredDishIds}
              dishes={data.dishes}
              meals={data.meals}
              today={today}
              feasibility={feasibility}
              lockedDishIds={lockedDishIds}
              onChange={(requiredDishIds) => patch({ requiredDishIds })}
            />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {form.engine === "ai" ? (
            <Card title="Nye retter" hint="Helt nye retter, som Assist laver, og som ikke findes i jeres retter endnu.">
            <Stepper
              label="Antal nye retter"
              unit="nye retter"
              value={form.newDishCount}
              min={0}
              max={MAX_NEW_DISHES}
              describe={(n) => (n === 0 ? "Ingen nye" : `${n} ${n === 1 ? "ny" : "nye"}`)}
              onChange={(newDishCount) => patch({ newDishCount })}
            />
          </Card>
          ) : (
            <p className="m-0 rounded-[24px] bg-surface p-5 text-[15px] leading-snug text-ink-2">
              Hurtigt forslag bruger kun jeres egne retter. Vælg Assist for at få nye retter.
            </p>
          )}
          <Card title="Tid pr. ret" hint={form.relaxedDates.length ? "Gælder ikke dage med god tid." : undefined}>
            <div role="group" aria-label="Højeste tilberedningstid" className="flex flex-wrap gap-2">
              {PREP_CHOICES.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={form.maxPrepMinutes === choice.minutes}
                  onClick={() => patch({ maxPrepMinutes: choice.minutes })}
                  className={chipClass(form.maxPrepMinutes === choice.minutes)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
              Budget til indkøb (valgfrit)
              <span className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={form.budget}
                  onChange={(event) => patch({ budget: event.target.value.replace(/[^\d]/gu, "") })}
                  placeholder="Fx 600"
                  className={`${input} h-12 max-w-[160px] font-normal`}
                />
                <span className="font-normal text-muted">kr.</span>
              </span>
            </label>
          </Card>
          <Card title="Det har vi i køleskabet" hint="Kun til denne plan. Ændrer ikke jeres køleskab under Indstillinger.">
            <ChipInput label="Køleskab" hideLabel values={form.fridge} onChange={(fridge) => patch({ fridge })} placeholder="Fx spinat, fløde" />
          </Card>
          <Card title="Forslag fra">
            <EngineChoice value={form.engine} aiAvailable={aiAvailable} onChange={(engine) => patch({ engine })} />
          </Card>
        </div>
      </div>
      {!check.ok ? (
        <p role="alert" className="m-0 rounded-2xl bg-offer-soft px-4 py-3 text-[15px] leading-snug text-offer">
          {check.message}
        </p>
      ) : null}
    </div>
  );
}
