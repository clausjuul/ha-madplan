import { Minus, Plus } from "lucide-react";
import type { IngredientLine } from "@/lib/cook-model";

type Props = {
  lines: IngredientLine[];
  servings: number;
  onServings: (servings: number) => void;
  /** Larger type for the "no instructions" page. */
  large?: boolean;
  /** Hide the heading when a surrounding sheet already has it. */
  hideTitle?: boolean;
};

const step =
  "flex h-11 w-11 items-center justify-center rounded-full border-0 bg-raised text-ink disabled:opacity-40";

/** Ingredients scaled to the chosen number of people, with a +/- control. */
export function IngredientList({ lines, servings, onServings, large, hideTitle }: Props) {
  return (
    <div className="flex min-h-0 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        {hideTitle ? null : <h2 className="text-lg font-semibold">Ingredienser</h2>}
        <div className="flex items-center gap-2" role="group" aria-label="Antal personer">
          <button type="button" aria-label="Færre personer" disabled={servings <= 1} onClick={() => onServings(servings - 1)} className={step}>
            <Minus size={18} aria-hidden="true" />
          </button>
          <span className="min-w-[88px] text-center text-sm text-ink-2" aria-live="polite">
            til {servings} {servings === 1 ? "person" : "personer"}
          </span>
          <button type="button" aria-label="Flere personer" disabled={servings >= 30} onClick={() => onServings(servings + 1)} className={step}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul className={`m-0 flex list-none flex-col overflow-y-auto p-0 ${large ? "text-xl" : "text-base"}`}>
        {lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="flex gap-3 border-b border-white/[0.06] py-[7px]">
            <span className="w-[78px] shrink-0 text-muted">{line.amount}</span>
            <span>{line.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
