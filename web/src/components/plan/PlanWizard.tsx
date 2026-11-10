import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type { BootstrapResponse, PlanDraftRecord, PlanRequest } from "@madplan/domain";
import { formDates, formFromRequest, initialForm, planTitle, toRequest, validateDays, validateWishes, type PlanForm } from "@/lib/plan-form";
import { PlanShell } from "./PlanShell";
import type { PlanStep } from "./PlanHeader";
import { StepDays } from "./StepDays";
import { StepWishes } from "./StepWishes";

type Props = {
  data: BootstrapResponse;
  today: string;
  /** The draft that is being replaced, if any. */
  draft: PlanDraftRecord | null;
  /** Wishes to start from, e.g. after cancelling a plan that was being made. */
  seed: PlanRequest | null;
  busy: boolean;
  onSubmit: (request: PlanRequest) => void;
  onBackToDraft: () => void;
};

/** Steps 1 and 2. The form lives here until "Lav forslag" turns it into a draft on the server. */
export function PlanWizard({ data, today, draft, seed, busy, onSubmit, onBackToDraft }: Props) {
  const aiAvailable = data.capabilities.openai;
  const fridgeNames = useMemo(() => data.fridge.map((item) => item.name), [data.fridge]);
  const [form, setForm] = useState<PlanForm>(() => {
    const start = draft?.request ?? seed;
    if (!start) return initialForm(today, fridgeNames, aiAvailable);
    const restored = formFromRequest(start, aiAvailable);
    return start.fridgeOverride ? restored : { ...restored, fridge: fridgeNames };
  });
  const [step, setStep] = useState<1 | 2>(1);
  const dates = formDates(form, today);
  const check = step === 1 ? validateDays(form, today) : validateWishes(form, today, data.meals);
  const submit = (): void => onSubmit(toRequest(form, today, fridgeNames));
  const onStep = (target: PlanStep): void => {
    if (target === 3) onBackToDraft();
    else setStep(target);
  };

  return (
    <PlanShell
      title={planTitle(dates, today)}
      step={step}
      reached={draft ? 3 : step}
      onStep={onStep}
      saved={draft !== null}
    >
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-5 md:px-8 md:pt-6">
        {step === 1 ? (
          <StepDays form={form} onChange={setForm} data={data} today={today} />
        ) : (
          <StepWishes form={form} onChange={setForm} data={data} today={today} />
        )}
      </main>
      <footer
        className="flex shrink-0 flex-wrap items-center gap-3 border-t border-hairline bg-ground px-4 pt-3 md:px-8"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        {draft ? (
          <button type="button" onClick={onBackToDraft} className="min-h-11 rounded-full px-3 text-[15px] font-medium text-muted hover:text-ink">
            Tilbage til forslaget
          </button>
        ) : null}
        <div className="flex-1" />
        {step === 2 ? (
          <span className="hidden text-[13px] text-muted md:inline">
            {form.engine === "ai" ? "Forslag fra Assist (AI)" : "Hurtigt forslag (lokalt)"}
            {draft ? " · erstatter den nuværende kladde" : ""}
          </span>
        ) : null}
        {step === 2 ? (
          <button type="button" onClick={() => setStep(1)} className="flex h-12 items-center gap-2 rounded-full border border-line px-5 text-[15px] font-medium text-ink-2">
            <ArrowLeft size={18} aria-hidden="true" />
            Dage
          </button>
        ) : null}
        {step === 1 ? (
          <button
            type="button"
            disabled={!check.ok}
            onClick={() => setStep(2)}
            className="flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-on-accent disabled:opacity-50"
          >
            Næste: Ønsker
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!check.ok || busy}
            onClick={submit}
            className="flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-on-accent disabled:opacity-50"
          >
            <Sparkles size={18} aria-hidden="true" />
            Lav forslag
          </button>
        )}
      </footer>
    </PlanShell>
  );
}
