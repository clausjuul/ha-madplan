import { Lock, MoreHorizontal, Plus } from "lucide-react";
import { DishImage } from "@/components/ui/DishImage";
import { useLongPress } from "@/hooks/use-long-press";
import type { DayModel } from "@/lib/week-model";
import type { DayHandlers } from "./week-types";

const pill = "rounded-full px-2 py-[3px] text-xs font-semibold";

function PhoneRow({ day, handlers }: { day: DayModel; handlers: DayHandlers }) {
  const longPress = useLongPress(() => handlers.openActions(day.date));
  const { dish } = day;
  return (
    <li
      data-day={day.date}
      className={`flex items-center gap-3 rounded-[18px] bg-surface p-2 ${
        day.isPast ? "opacity-60" : ""
      }`}
      {...longPress}
    >
      <button
        type="button"
        onClick={() => (dish ? handlers.openRecipe(day.date) : handlers.openPicker(day.date))}
        className="flex min-w-0 flex-1 items-center gap-3 text-left text-ink"
      >
        {dish ? (
          <DishImage dish={dish} width={56} height={56} decorative className="h-14 w-14 shrink-0 rounded-xl" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-xl border-[1.5px] border-dashed border-line text-muted"
          >
            <Plus size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            {day.longLabel}
            {day.locked ? <Lock size={13} role="img" aria-label="Låst" /> : null}
            {day.isNew ? <span className={`${pill} bg-new text-on-new`}>Ny</span> : null}
            {day.isUntried && !day.isPast ? <span className={`${pill} bg-raised font-medium text-muted`}>Ikke prøvet</span> : null}
            {day.hasOffer ? <span className={`${pill} bg-offer text-on-offer`}>Tilbud</span> : null}
          </span>
          <span
            className={`block truncate text-base font-semibold ${dish ? "" : "text-accent"}`}
          >
            {dish ? dish.name : "Vælg en ret"}
          </span>
          {day.variantLines.map((line) => (
            <span key={line} className="block truncate text-[13px] text-ink-2">
              {line}
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Handlinger for ${day.longLabel}`}
        onClick={() => handlers.openActions(day.date)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </li>
  );
}

export function PhoneList({
  days,
  handlers,
  heading,
}: {
  days: DayModel[];
  handlers: DayHandlers;
  heading: string;
}) {
  return (
    <>
      <h2 className="mx-0.5 mb-0 mt-2 text-[15px] font-semibold text-muted">{heading}</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {days.map((day) => (
          <PhoneRow key={day.date} day={day} handlers={handlers} />
        ))}
      </ul>
    </>
  );
}
