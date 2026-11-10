import type { DishHistoryStat } from "@madplan/domain";
import { DishImage } from "@/components/ui/DishImage";
import { lastEatenLabel, plural } from "@/lib/library";
import { routeHref } from "@/lib/route";

type Props = { mostEaten: DishHistoryStat[]; longestSince: DishHistoryStat[]; today: string };

function Row({ title, stats, detail }: { title: string; stats: DishHistoryStat[]; detail: (stat: DishHistoryStat) => string }) {
  if (stats.length === 0) return null;
  return (
    <section aria-label={title} className="min-w-0 flex-1">
      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{title}</h2>
      <ul className="no-scrollbar m-0 flex list-none gap-2 overflow-x-auto p-0">
        {stats.map((stat) => (
          <li key={stat.dish.id} className="shrink-0">
            <a
              href={routeHref({ name: "retter", dishId: stat.dish.id })}
              className="flex h-14 items-center gap-2.5 rounded-full bg-surface pl-1.5 pr-4 text-ink no-underline hover:bg-raised"
            >
              <DishImage dish={stat.dish} width={44} height={44} decorative className="h-11 w-11 rounded-full" />
              <span className="flex flex-col leading-tight">
                <span className="max-w-[150px] truncate text-[14px] font-semibold">{stat.dish.name}</span>
                <span className="text-xs text-muted">{detail(stat)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Small history strip on top of the library: favourites by count and dishes not eaten for a long time. */
export function HistoryStrip({ mostEaten, longestSince, today }: Props) {
  if (mostEaten.length === 0 && longestSince.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
      <Row title="Mest spist" stats={mostEaten} detail={(stat) => plural(stat.count, "gang", "gange")} />
      <Row
        title="Længe siden"
        stats={longestSince}
        detail={(stat) => lastEatenLabel(stat.lastDate, today)}
      />
    </div>
  );
}
