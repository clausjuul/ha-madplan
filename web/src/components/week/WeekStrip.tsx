import { useState } from "react";
import { plannedCount, type DayModel } from "@/lib/week-model";
import { DayCard, type DragApi } from "./DayCard";
import type { DayHandlers } from "./week-types";

type Props = {
  days: DayModel[];
  handlers: DayHandlers;
  onSwap: (a: string, b: string) => void;
};

export function WeekStrip({ days, handlers, onSwap }: Props) {
  const [draggingDate, setDragging] = useState<string | null>(null);
  const [overDate, setOver] = useState<string | null>(null);

  const drag: DragApi = {
    draggingDate,
    overDate,
    start: setDragging,
    over: setOver,
    end: () => {
      setDragging(null);
      setOver(null);
    },
    drop: onSwap,
  };

  return (
    <section aria-label="Ugen" className="flex min-h-0 flex-1 flex-col gap-3.5">
      <div className="flex items-baseline gap-3.5">
        <h2 className="font-display m-0 text-2xl font-bold">Ugen</h2>
        <span className="text-sm text-muted">
          {plannedCount(days)} af 7 dage planlagt · træk et kort for at bytte dage
        </span>
      </div>
      <div className="grid flex-1 grid-cols-4 gap-3 lg:grid-cols-7">
        {days.map((day) => (
          <DayCard key={day.date} day={day} handlers={handlers} drag={drag} />
        ))}
      </div>
    </section>
  );
}
