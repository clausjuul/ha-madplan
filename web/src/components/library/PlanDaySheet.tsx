import { Lock } from "lucide-react";
import { addDaysToKey, formatShortDate, weekdayName, type BootstrapResponse, type Dish } from "@madplan/domain";
import { useMealActions } from "@/api/meal-mutations";
import { Sheet } from "@/components/ui/Sheet";
import { notify } from "@/lib/notify";

type Props = { open: boolean; dish: Dish; data: BootstrapResponse; today: string; onClose: () => void };

const dayLabel = (date: string): string => {
  const name = weekdayName(date);
  return `${name.charAt(0).toLocaleUpperCase("da-DK")}${name.slice(1)} ${formatShortDate(date)}`;
};

/** Pick one of the next 14 days to put the dish on. */
export function PlanDaySheet({ open, dish, data, today, onClose }: Props) {
  const actions = useMealActions(data.meals);
  const dishName = (id: string): string => data.dishes.find((candidate) => candidate.id === id)?.name ?? "";

  const pick = (date: string): void => {
    actions.setMeal(date, { dishId: dish.id });
    notify(`${dish.name} er planlagt ${dayLabel(date).toLocaleLowerCase("da-DK")}.`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Planlæg" subtitle={`Vælg dag for ${dish.name}`} tall>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 px-3 pb-2">
        {Array.from({ length: 14 }, (_, offset) => addDaysToKey(today, offset)).map((date) => {
          const meal = data.meals[date];
          const locked = Boolean(meal?.locked);
          return (
            <li key={date}>
              <button
                type="button"
                disabled={locked}
                onClick={() => pick(date)}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-raised px-4 py-2 text-left text-ink enabled:hover:bg-line disabled:opacity-50"
              >
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">
                    {date === today ? "I dag" : dayLabel(date)}
                  </span>
                  <span className="block text-sm text-muted">
                    {meal ? `Nu: ${dishName(meal.dishId)}` : "Ingen ret planlagt"}
                  </span>
                </span>
                {locked ? <Lock size={16} aria-label="Låst" className="text-muted" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
