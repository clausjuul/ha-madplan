import { Check } from "lucide-react";
import type { PlanEngine } from "@madplan/domain";

type Props = {
  value: PlanEngine;
  aiAvailable: boolean;
  onChange: (engine: PlanEngine) => void;
};

/** Who makes the plan. The local engine is never presented as AI. */
export function EngineChoice({ value, aiAvailable, onChange }: Props) {
  const card = (active: boolean): string =>
    `flex min-h-[72px] w-full items-start gap-3 rounded-2xl border p-4 text-left ${
      active ? "border-accent bg-accent-soft" : "border-line bg-ground"
    }`;
  return (
    <fieldset role="radiogroup" className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-ink-2">Hvem skal lave forslaget?</legend>
      {aiAvailable ? (
        <button type="button" role="radio" aria-checked={value === "ai"} onClick={() => onChange("ai")} className={card(value === "ai")}>
          <Dot active={value === "ai"} />
          <span>
            <strong className="block text-base">Assist (AI med websøgning)</strong>
            <span className="text-[14px] leading-snug text-muted">Kan foreslå nye retter og følge tilbud. Tager typisk et halvt minut eller mere.</span>
          </span>
        </button>
      ) : null}
      <button type="button" role="radio" aria-checked={value === "local"} onClick={() => onChange("local")} className={card(value === "local")}>
        <Dot active={value === "local"} />
        <span>
          <strong className="block text-base">Hurtigt forslag (lokalt)</strong>
          <span className="text-[14px] leading-snug text-muted">
            Vælger blandt jeres egne retter efter jeres regler, uden AI. Svarer med det samme.
          </span>
        </span>
      </button>
      {!aiAvailable ? (
        <p className="m-0 text-[14px] leading-snug text-muted">
          AI-planlægning er ikke slået til, fordi der ikke er tilføjet en OpenAI-nøgle i appens indstillinger i Home Assistant.
        </p>
      ) : null}
    </fieldset>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${active ? "bg-accent text-on-accent" : "border border-line"}`}
    >
      {active ? <Check size={14} strokeWidth={3} /> : null}
    </span>
  );
}
