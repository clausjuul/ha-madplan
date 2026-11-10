import { ExternalLink } from "lucide-react";
import type { Dish } from "@madplan/domain";
import type { IngredientLine } from "@/lib/cook-model";
import { IngredientList } from "./IngredientList";

type Props = {
  dish: Dish;
  lines: IngredientLine[];
  servings: number;
  onServings: (servings: number) => void;
};

/** Recipes without step-by-step instructions: the ingredients, plus a link to the source if there is one. */
export function NoInstructions({ dish, lines, servings, onServings }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <p className="m-0 text-base text-ink-2">Der er ingen trin til denne ret endnu. Her er ingredienserne.</p>
      <div className="max-w-[560px]">
        <IngredientList lines={lines} servings={servings} onServings={onServings} large />
      </div>
      {dish.sourceUrl ? (
        <a
          href={dish.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex h-14 items-center gap-2.5 self-start rounded-full bg-accent px-6 text-base font-semibold text-on-accent no-underline"
        >
          <ExternalLink size={20} aria-hidden="true" />
          Åbn opskriften
        </a>
      ) : null}
    </div>
  );
}
