import { useMemo, useState } from "react";
import { profileServings, targetServings } from "@madplan/domain";
import { useBootstrap, useShopping } from "@/api/queries";
import { useMealActions } from "@/api/meal-mutations";
import { useIsWide } from "@/hooks/use-media";
import { useToday } from "@/hooks/use-today";
import { mondayOf } from "@/lib/route";
import { buildDay, buildWeek } from "@/lib/week-model";
import { WeekSkeleton } from "@/components/ui/Skeletons";
import { ErrorState, ImportOffer } from "@/components/ui/StatusViews";
import { PhoneList } from "./PhoneList";
import { RateRecent } from "./RateRecent";
import { ShoppingSummary, UseFirst } from "./SidePanels";
import { TonightHero } from "./TonightHero";
import { WeekSheets, type SheetState } from "./WeekSheets";
import { WeekStrip } from "./WeekStrip";
import type { DayHandlers } from "./week-types";

export function WeekView({ weekStart }: { weekStart: string }) {
  const today = useToday();
  const wide = useIsWide();
  const bootstrap = useBootstrap();
  const shopping = useShopping();
  const data = bootstrap.data;
  const actions = useMealActions(data?.meals);
  const [sheet, setSheet] = useState<SheetState>(null);

  const days = useMemo(
    () => (data ? buildWeek(weekStart, today, data.meals, data.dishes) : []),
    [data, weekStart, today],
  );
  const tonight = useMemo(
    () => (data ? buildDay(today, today, data.meals, data.dishes) : null),
    [data, today],
  );

  if (bootstrap.isError && !data) {
    return <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  }
  if (!data || !tonight) return <WeekSkeleton wide={wide} />;

  const handlers: DayHandlers = {
    openRecipe: (date) => setSheet({ kind: "recipe", date }),
    openActions: (date) => setSheet({ kind: "actions", date }),
    openPicker: (date) => setSheet({ kind: "picker", date }),
    suggest: (date) => actions.suggest(date),
  };
  const servings = targetServings(profileServings(data.profiles), data.settings.preferredServings);
  const isCurrentWeek = weekStart === mondayOf(today);
  const rate = isCurrentWeek ? (
    <RateRecent
      meals={data.meals}
      dishes={data.dishes}
      today={today}
      onRate={(date, rating) => actions.patchMeal(date, { rating })}
    />
  ) : null;
  const sheets = <WeekSheets sheet={sheet} setSheet={setSheet} data={data} today={today} actions={actions} />;

  if (!wide) {
    const rest = isCurrentWeek ? days.filter((day) => day.date !== today) : days;
    return (
      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {data.isEmpty ? <ImportOffer /> : null}
        {rate}
        <TonightHero day={tonight} servings={servings} handlers={handlers} wide={false} />
        <PhoneList days={rest} handlers={handlers} heading={isCurrentWeek ? "Resten af ugen" : "Ugen"} />
        {sheets}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-[26px] px-6 pb-7 pt-6 lg:px-8">
      {data.isEmpty ? <ImportOffer /> : null}
      {rate}
      <div className="grid gap-4 lg:h-[292px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <TonightHero day={tonight} servings={servings} handlers={handlers} wide />
        <div className="grid grid-cols-2 gap-4 lg:flex lg:flex-col">
          <ShoppingSummary list={shopping.data} />
          <UseFirst fridge={data.fridge} today={today} />
        </div>
      </div>
      <WeekStrip days={days} handlers={handlers} onSwap={(a, b) => void actions.swap(a, b)} />
      {sheets}
    </div>
  );
}
