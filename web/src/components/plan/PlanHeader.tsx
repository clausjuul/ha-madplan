import { Check, X } from "lucide-react";
import { routeHref } from "@/lib/route";

export type PlanStep = 1 | 2 | 3;
const STEPS: { step: PlanStep; label: string }[] = [
  { step: 1, label: "Dage" },
  { step: 2, label: "Ønsker" },
  { step: 3, label: "Gennemse" },
];

type Props = {
  title: string;
  step: PlanStep;
  /** Highest step the person may jump back to; later steps are not clickable. */
  reached: PlanStep;
  onStep: (step: PlanStep) => void;
  saved: boolean;
};

/** Full-screen flow header: close, title, 3-step breadcrumb and the "draft is saved" note. */
export function PlanHeader({ title, step, reached, onStep, saved }: Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-hairline px-4 md:h-[72px] md:gap-5 md:px-8">
      <a
        href={routeHref({ name: "uge" })}
        aria-label="Luk og gå tilbage til ugen"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink"
      >
        <X size={20} aria-hidden="true" />
      </a>
      <strong className="font-display shrink-0 whitespace-nowrap text-lg font-bold md:text-[22px]">{title}</strong>
      <ol aria-label="Trin" className="m-0 flex list-none items-center gap-2 p-0 text-sm md:ml-3">
        {STEPS.map(({ step: number, label }, index) => {
          const current = number === step;
          const done = number < step || (number < reached && !current);
          const clickable = number < step || (number <= reached && !current);
          const dot = (
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
                current ? "bg-accent font-semibold text-on-accent" : "bg-raised text-accent"
              }`}
            >
              {done ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : number}
            </span>
          );
          const text = <span className={current ? "hidden font-semibold text-ink md:inline" : "hidden text-muted md:inline"}>{label}</span>;
          return (
            <li key={number} aria-current={current ? "step" : undefined} className="flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true" className="h-px w-3 bg-line md:w-6" /> : null}
              {clickable ? (
                <button type="button" onClick={() => onStep(number)} className="flex min-h-11 items-center gap-2 rounded-full pr-1 text-muted hover:text-ink" aria-label={`Gå til trin ${number}: ${label}`}>
                  {dot}
                  {text}
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  {dot}
                  {text}
                  <span className="sr-only md:hidden">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex-1" />
      {saved ? (
        <span className="flex items-center gap-2 text-sm text-muted" role="status">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-ok" />
          <span className="hidden lg:inline">Kladden er gemt – du kan lukke og fortsætte senere</span>
          <span className="hidden md:inline lg:hidden">Kladden er gemt</span>
          <span className="sr-only md:hidden">Kladden er gemt</span>
        </span>
      ) : null}
    </header>
  );
}
