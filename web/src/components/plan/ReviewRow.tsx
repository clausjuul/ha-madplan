import { Lock, RefreshCw, Search, X } from "lucide-react";
import { parseDateKey, weekdayName, type Dish, type DraftDay } from "@madplan/domain";
import type { DayBadge } from "@/lib/draft-summary";
import { DishImage } from "@/components/ui/DishImage";

type Props = {
  day: DraftDay;
  dish: Dish | undefined;
  badge: DayBadge;
  /** A day marked "god tid" in the request. */
  relaxed?: boolean;
  /** "Oliver: nuggets i stedet for bøf". */
  variantLines?: string[];
  onDropVariants?: () => void;
  busy: boolean;
  onLock: () => void;
  onRegenerate: () => void;
  onPick: () => void;
};

const iconButton =
  "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-raised text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-40 md:w-11";

/** One day of the draft: photo, dish, badges, reason and the three per-day actions. */
export function ReviewRow({ day, dish, badge, relaxed, variantLines = [], onDropVariants, busy, onLock, onRegenerate, onPick }: Props) {
  const date = parseDateKey(day.date);
  const weekday = weekdayName(day.date, "long");
  return (
    <article
      aria-label={`${weekday} ${date.getDate()}.`}
      className={`flex flex-wrap items-center gap-3 rounded-[18px] bg-surface py-3 pl-3 pr-3 md:gap-4 md:py-2 md:pl-[18px] md:pr-3 ${
        day.locked ? "shadow-[inset_0_0_0_1.5px_rgb(124_236_255/0.45)]" : ""
      }`}
    >
      <div className="w-12 shrink-0 md:w-[74px]">
        <div className="text-[13px] capitalize text-muted">{weekday.slice(0, 3)}<span className="hidden md:inline">{weekday.slice(3)}</span></div>
        <div className="font-display text-xl font-bold md:text-[22px]">{date.getDate()}.</div>
      </div>
      {dish ? (
        <DishImage dish={dish} width={64} height={64} decorative className="h-14 w-14 shrink-0 rounded-[14px] md:h-16 md:w-16" />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-[14px] bg-raised md:h-16 md:w-16" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="text-base font-semibold md:text-[17px]">{dish?.name ?? "Ukendt ret"}</strong>
          {badge === "new" ? <span className="rounded-full bg-new px-2 py-[3px] text-xs font-semibold text-on-new">Ny ret</span> : null}
          {badge === "untried" ? <span className="rounded-full bg-raised px-2 py-[3px] text-xs font-medium text-muted">Ikke prøvet</span> : null}
          {relaxed ? <span className="rounded-full bg-accent-soft px-2 py-[3px] text-xs font-semibold text-accent">God tid</span> : null}
          {day.offer ? (
            <span className="rounded-full bg-offer px-2 py-[3px] text-xs font-semibold text-on-offer">
              {day.offer.store}{day.offer.price ? ` · ${day.offer.price}` : ""}
            </span>
          ) : null}
        </div>
        {variantLines.map((line) => (
          <span key={line} className="flex items-center gap-1 text-sm font-medium leading-snug text-ink-2">
            {line}
            {onDropVariants ? (
              <button
                type="button"
                aria-label={`Fjern bytte: ${line}`}
                disabled={busy}
                onClick={onDropVariants}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
        <span className="line-clamp-3 text-sm leading-snug text-muted md:line-clamp-1">{day.reason}</span>
      </div>
      <div className="grid w-full shrink-0 grid-cols-3 gap-1.5 md:flex md:w-auto">
        <button
          type="button"
          aria-pressed={day.locked}
          aria-label={day.locked ? "Låst, lås dagen op" : "Lås dagen"}
          disabled={busy}
          onClick={onLock}
          className={`${iconButton} ${day.locked ? "!bg-accent !text-on-accent" : ""}`}
        >
          <Lock size={18} aria-hidden="true" />
          <span className="md:hidden">{day.locked ? "Låst" : "Lås"}</span>
        </button>
        <button
          type="button"
          aria-label="Lav om, se alternativer til denne dag"
          title={day.locked ? "Lås dagen op for at lave den om" : undefined}
          disabled={busy || day.locked}
          onClick={onRegenerate}
          className={iconButton}
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span className="md:hidden">Lav om</span>
        </button>
        <button type="button" aria-label="Vælg selv en ret" disabled={busy} onClick={onPick} className={iconButton}>
          <Search size={18} aria-hidden="true" />
          <span className="md:hidden">Vælg selv</span>
        </button>
      </div>
    </article>
  );
}
