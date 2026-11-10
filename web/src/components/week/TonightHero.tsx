import { ArrowLeftRight, ChefHat, Clock, MoreHorizontal } from "lucide-react";
import { formatFullDate } from "@madplan/domain";
import { DishImage } from "@/components/ui/DishImage";
import { routeHref } from "@/lib/route";
import type { DayModel } from "@/lib/week-model";
import type { DayHandlers } from "./week-types";

type Props = { day: DayModel; servings: number; handlers: DayHandlers; wide: boolean };

const chip = "flex items-center gap-1.5 whitespace-nowrap rounded-full bg-raised px-3 py-1.5 text-[13px] text-ink-2";
const ghost =
  "flex items-center justify-center gap-2 rounded-full border border-line bg-transparent text-ink hover:bg-raised";

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase("da-DK") + value.slice(1);

function ForslagTag() {
  return (
    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Forslag</span>
  );
}

function ReasonLine({ day }: { day: DayModel }) {
  const reason = day.meal?.reason;
  if (!reason) return null;
  return (
    <p className="mt-0.5 text-[15px] leading-normal text-muted">
      {reason}
    </p>
  );
}

function EmptyTonight({ day, handlers }: { day: DayModel; handlers: DayHandlers }) {
  return (
    <section
      aria-label="I aften"
      className="flex flex-col justify-center gap-3 rounded-[28px] border-[1.5px] border-dashed border-line p-7 lg:h-[292px]"
    >
      <span className="text-sm font-semibold uppercase tracking-wider text-accent">I aften</span>
      <h1 className="font-display text-4xl font-bold leading-none">Ingen ret i aften</h1>
      <p className="text-[15px] text-muted">{capitalize(formatFullDate(day.date))}</p>
      <div className="mt-2 flex gap-2.5">
        <button
          type="button"
          onClick={() => handlers.openPicker(day.date)}
          className="h-12 rounded-full bg-ink px-6 text-[15px] font-semibold text-ground"
        >
          Vælg ret
        </button>
        <button
          type="button"
          onClick={() => handlers.suggest(day.date)}
          className="h-12 rounded-full bg-accent-soft px-6 text-[15px] font-semibold text-accent"
        >
          Foreslå
        </button>
      </div>
    </section>
  );
}

export function TonightHero({ day, servings, handlers, wide }: Props) {
  const { dish } = day;
  if (!dish) return <EmptyTonight day={day} handlers={handlers} />;

  if (!wide) {
    return (
      <section aria-label="I aften" className="relative h-[210px] shrink-0 overflow-hidden rounded-3xl bg-surface">
        <DishImage dish={dish} width={358} height={210} eager className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-30% to-ground/90" />
        <button
          type="button"
          aria-label="Åbn opskrift"
          onClick={() => handlers.openRecipe(day.date)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <button
          type="button"
          aria-label="Flere handlinger for i aften"
          onClick={() => handlers.openActions(day.date)}
          className="absolute right-2.5 top-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-scrim text-ink"
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
        <div className="pointer-events-none absolute inset-x-[18px] bottom-4 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-accent">I aften</div>
            <h1 className="font-display text-[32px] font-bold leading-[1.05]">{dish.name}</h1>
            <div className="mt-1 text-[13px] text-ink-2">
              {dish.prepMinutes} min · til {servings}
            </div>
          </div>
          <a
            href={routeHref({ name: "lav-mad", dishId: dish.id })}
            className="pointer-events-auto flex h-11 items-center rounded-full bg-ink px-[18px] text-[15px] font-semibold text-ground no-underline"
          >
            Lav mad
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="I aften"
      className="relative grid min-h-[292px] grid-cols-[50%_minmax(0,1fr)] overflow-hidden rounded-[28px] bg-surface lg:h-[292px]"
    >
      <button
        type="button"
        aria-label={`Åbn opskrift: ${dish.name}`}
        onClick={() => handlers.openRecipe(day.date)}
        className="relative block h-full min-h-[292px] w-full p-0"
      >
        <DishImage dish={dish} width={560} height={292} eager className="absolute inset-0 h-full w-full" />
      </button>
      <div className="flex min-w-0 flex-col gap-2 px-[30px] py-6">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold uppercase tracking-wider text-accent">I aften</span>
          <span className="truncate text-sm text-muted">{capitalize(formatFullDate(day.date))}</span>
          {day.meal?.source === "local" && day.meal.reason ? <ForslagTag /> : null}
        </div>
        <h1 className="font-display mt-1 text-[40px] font-bold leading-none tracking-tight lg:text-[52px]">
          {dish.name}
        </h1>
        <div className="mt-1 flex flex-wrap gap-2">
          <span className={chip}>
            <Clock size={15} aria-hidden="true" />
            {dish.prepMinutes} min
          </span>
          <span className={chip}>Til {servings} personer</span>
          {dish.leftoverFriendly ? <span className={chip}>Rester til i morgen</span> : null}
        </div>
        <ReasonLine day={day} />
        <div className="flex-1" />
        <div className="flex gap-2.5">
          <a
            href={routeHref({ name: "lav-mad", dishId: dish.id })}
            className="flex h-[52px] items-center gap-2.5 whitespace-nowrap rounded-full bg-ink px-5 text-base font-semibold text-ground no-underline"
          >
            <ChefHat size={20} aria-hidden="true" />
            Lav mad
          </a>
          <button
            type="button"
            onClick={() => handlers.openPicker(day.date)}
            disabled={day.locked}
            className={`${ghost} h-[52px] whitespace-nowrap px-5 text-base font-medium disabled:opacity-40`}
          >
            <ArrowLeftRight size={18} aria-hidden="true" />
            Byt ret
          </button>
          <button
            type="button"
            aria-label="Flere handlinger for i aften"
            onClick={() => handlers.openActions(day.date)}
            className={`${ghost} h-[52px] w-[52px]`}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
