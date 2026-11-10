import { useRef } from "react";
import { motion } from "motion/react";
import { Lock, MoreHorizontal } from "lucide-react";
import { DishImage } from "@/components/ui/DishImage";
import { useLongPress } from "@/hooks/use-long-press";
import type { DayModel } from "@/lib/week-model";
import type { DayHandlers } from "./week-types";

export type DragApi = {
  overDate: string | null;
  draggingDate: string | null;
  start: (date: string) => void;
  over: (date: string | null) => void;
  end: () => void;
  drop: (from: string, to: string) => void;
};

/** The day card under a page point, ignoring the card being dragged. */
export function dayAtPoint(x: number, y: number, ignore: string): string | null {
  for (const element of document.elementsFromPoint(x - window.scrollX, y - window.scrollY)) {
    const date = element.closest<HTMLElement>("[data-day]")?.dataset.day;
    if (date && date !== ignore) return date;
  }
  return null;
}

type Props = { day: DayModel; handlers: DayHandlers; drag: DragApi };

const badge = "rounded-full px-[9px] py-1 text-xs font-semibold";

function EmptyDayCard({ day, handlers, drag }: Props) {
  const isTarget = drag.overDate === day.date;
  return (
    <article
      data-day={day.date}
      aria-label={`${day.longLabel}, ingen ret`}
      className={`flex min-h-[250px] flex-col gap-1.5 rounded-[20px] border-[1.5px] border-dashed p-3.5 ${
        isTarget ? "border-ok bg-raised" : "border-line"
      } ${day.isToday ? "ring-2 ring-accent" : ""} ${day.isPast ? "opacity-60" : ""}`}
    >
      <span className={`text-[13px] font-semibold ${day.isToday ? "text-accent" : "text-muted"}`}>
        {day.shortLabel}
        {day.isToday ? " · i dag" : ""}
      </span>
      <span className="flex-1" />
      <strong className="text-[15px] font-semibold">Ingen ret endnu</strong>
      <button
        type="button"
        onClick={() => handlers.openPicker(day.date)}
        className="h-11 rounded-[14px] bg-raised text-sm font-semibold text-ink"
      >
        Vælg ret
      </button>
      <button
        type="button"
        onClick={() => handlers.suggest(day.date)}
        className="h-11 rounded-[14px] bg-accent-soft text-sm font-semibold text-accent"
      >
        Foreslå
      </button>
    </article>
  );
}

export function DayCard(props: Props) {
  const { day, handlers, drag } = props;
  const wasDragged = useRef(false);
  const longPress = useLongPress(() => {
    if (!wasDragged.current) handlers.openActions(day.date);
  });
  const { dish } = day;
  if (!dish) return <EmptyDayCard {...props} />;

  const isTarget = drag.overDate === day.date;
  const ring = isTarget
    ? "ring-2 ring-offset-2 ring-offset-ground ring-ok"
    : day.isToday
      ? "ring-2 ring-accent"
      : "";

  return (
    <motion.article
      data-day={day.date}
      aria-label={`${day.longLabel}, ${dish.name}`}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.1}
      whileDrag={{ scale: 1.05, zIndex: 40, boxShadow: "0 18px 40px rgba(0,0,0,0.55)" }}
      onDragStart={() => {
        wasDragged.current = true;
        drag.start(day.date);
      }}
      onDrag={(_, info) => drag.over(dayAtPoint(info.point.x, info.point.y, day.date))}
      onDragEnd={(_, info) => {
        const target = dayAtPoint(info.point.x, info.point.y, day.date);
        drag.end();
        if (target) drag.drop(day.date, target);
        setTimeout(() => {
          wasDragged.current = false;
        }, 0);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        handlers.openActions(day.date);
      }}
      {...longPress}
      className={`relative flex min-h-[250px] flex-col overflow-hidden rounded-[20px] bg-surface ${ring} ${
        day.isPast && !day.isToday ? "opacity-60" : ""
      }`}
      style={{ touchAction: "none" }}
    >
      <button
        type="button"
        onClick={() => {
          if (!wasDragged.current) handlers.openRecipe(day.date);
        }}
        className="flex min-h-0 flex-1 flex-col text-left text-ink"
      >
        <span className="relative block h-32 shrink-0">
          <DishImage dish={dish} width={170} height={128} decorative className="h-32 w-full" />
          <span className="absolute left-2.5 top-2.5 flex gap-1.5">
            {day.isNew ? <span className={`${badge} bg-new text-on-new`}>Ny ret</span> : null}
            {day.isUntried && !day.isPast ? <span className={`${badge} bg-raised font-medium text-muted`}>Ikke prøvet</span> : null}
            {day.hasOffer ? <span className={`${badge} bg-offer text-on-offer`}>Tilbud</span> : null}
          </span>
          {day.locked ? (
            <span
              role="img"
              aria-label="Låst"
              className="absolute right-2.5 top-2.5 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-scrim text-ink"
            >
              <Lock size={15} aria-hidden="true" />
            </span>
          ) : null}
        </span>
        <span className="flex flex-col gap-1 px-3.5 pb-3.5 pt-3">
          <span className={`pr-8 text-[13px] font-semibold ${day.isToday ? "text-accent" : "text-muted"}`}>
            {day.shortLabel}
            {day.isToday ? " · i dag" : ""}
          </span>
          <strong className="text-base font-semibold leading-tight">{dish.name}</strong>
          <span className="text-[13px] text-muted">{day.meta}</span>
          {day.meal?.note ? (
            <span className="line-clamp-1 text-[13px] italic text-ink-2">{day.meal.note}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Handlinger for ${day.longLabel}`}
        onClick={() => handlers.openActions(day.date)}
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute right-0.5 top-[130px] flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </motion.article>
  );
}
