import { useState } from "react";
import { Plus, X } from "lucide-react";
import { canIncludeDish, type Dish, type FeasibilityInput, type MealMap } from "@madplan/domain";
import { DishPickerSheet } from "@/components/week/sheets/DishPickerSheet";

type Props = {
  selected: readonly string[];
  dishes: readonly Dish[];
  meals: MealMap;
  today: string;
  feasibility: FeasibilityInput;
  lockedDishIds: ReadonlySet<string>;
  onChange: (ids: string[]) => void;
};

/** "Skal med": dishes that must be in the plan. Impossible picks are disabled with a reason. */
export function RequiredDishes({ selected, dishes, meals, today, feasibility, lockedDishIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  const reason = (dish: Dish): string | undefined => {
    if (selected.includes(dish.id)) return "Er allerede valgt";
    if (lockedDishIds.has(dish.id)) return "Står allerede på en låst dag";
    if (!canIncludeDish(dish.id, feasibility)) return "Der er ikke flere åbne dage";
    return undefined;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <span key={id} className="flex h-11 items-center gap-1 rounded-full bg-raised pl-4 pr-1 text-[15px]">
            {byId.get(id)?.name ?? id}
            <button
              type="button"
              aria-label={`Fjern ${byId.get(id)?.name ?? id}`}
              onClick={() => onChange(selected.filter((other) => other !== id))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-medium text-ink-2 hover:text-ink"
        >
          <Plus size={18} aria-hidden="true" />
          Vælg ret
        </button>
      </div>
      <DishPickerSheet
        open={open}
        dayLabel="Retten kommer med i planen"
        dishes={dishes}
        meals={meals}
        today={today}
        disabledReason={reason}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          onChange([...selected, id]);
          setOpen(false);
        }}
      />
    </div>
  );
}
