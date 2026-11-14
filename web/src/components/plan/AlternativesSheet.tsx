import { useMemo } from "react";
import { RefreshCw, Search } from "lucide-react";
import {
  eatenHistory,
  lastEatenByDish,
  rankAlternatives,
  ratingScores,
  type BootstrapResponse,
  type PlanDraftRecord,
} from "@madplan/domain";
import { Sheet } from "@/components/ui/Sheet";
import { DishImage } from "@/components/ui/DishImage";
import { dishOfDay } from "@/lib/draft-summary";

type Props = {
  date: string | null;
  dayLabel: string;
  draft: PlanDraftRecord;
  data: BootstrapResponse;
  today: string;
  onPick: (dishId: string) => void;
  onRegenerate: () => void;
  onSearch: () => void;
  onClose: () => void;
};

/** "Lav om": the three best local alternatives for one day, with their reasons, instead of a blind reroll. */
export function AlternativesSheet({ date, dayLabel, draft, data, today, onPick, onRegenerate, onSearch, onClose }: Props) {
  const alternatives = useMemo(() => {
    if (!date) return [];
    const current = draft.days.find((day) => day.date === date);
    const currentId = current ? dishOfDay(current, data.dishes)?.id : undefined;
    return rankAlternatives({
      day: date,
      otherDays: draft.days.flatMap((day) => {
        const id = day.dishId ?? day.newDish?.id;
        return id ? [{ date: day.date, dishId: id }] : [];
      }),
      excludeDishIds: currentId ? [currentId] : [],
      meals: data.meals,
      fridge: draft.request.fridgeOverride ? draft.request.fridgeOverride.map((name) => ({ name })) : data.fridge,
      lastEaten: lastEatenByDish(eatenHistory(data.meals, today)),
      seed: draft.request.seed ?? 1,
      dishes: data.dishes,
      maxPrepMinutes: draft.request.maxPrepMinutes,
      relaxedDates: draft.request.relaxedDates,
      userRequest: draft.request.request,
      dayRequests: draft.request.dayRequests,
      globalExclusions: data.settings.globalExclusions,
      profiles: data.profiles,
      ratingScores: ratingScores(data.meals),
    });
  }, [date, draft, data, today]);

  return (
    <Sheet open={date !== null} onClose={onClose} title="Lav om" subtitle={dayLabel}>
      <div className="flex flex-col gap-2 px-3 pb-4">
        {alternatives.length === 0 ? (
          <p className="m-0 px-2 py-6 text-center text-[15px] text-muted">Der er ingen andre retter, der passer til jeres regler.</p>
        ) : (
          <ul aria-label="Alternativer" className="m-0 flex list-none flex-col gap-1 p-0">
            {alternatives.map(({ dish, reason }) => (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => onPick(dish.id)}
                  className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl p-2 text-left text-ink hover:bg-raised"
                >
                  <DishImage dish={dish} width={56} height={56} decorative className="h-14 w-14 shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{dish.name}</span>
                    <span className="block text-[13px] text-muted">
                      {dish.prepMinutes} min · {reason}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-line text-[15px] font-medium text-ink-2"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Nyt forslag
          </button>
          <button
            type="button"
            onClick={onSearch}
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-line text-[15px] font-medium text-ink-2"
          >
            <Search size={16} aria-hidden="true" />
            Søg selv
          </button>
        </div>
      </div>
    </Sheet>
  );
}
