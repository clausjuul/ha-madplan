import { Clock, Heart } from "lucide-react";
import type { Dish } from "@madplan/domain";
import { DishImage } from "@/components/ui/DishImage";
import { routeHref } from "@/lib/route";

type Props = { dish: Dish; lastLabel: string; tried: boolean };

/** Photo-led dish card; links to the recipe. */
export function DishCard({ dish, lastLabel, tried }: Props) {
  return (
    <a
      href={routeHref({ name: "retter", dishId: dish.id })}
      className="group flex flex-col overflow-hidden rounded-3xl bg-surface text-ink no-underline transition-colors hover:bg-raised"
    >
      <div className="relative">
        <DishImage
          dish={dish}
          width={320}
          height={200}
          decorative
          className="aspect-[8/5] w-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {dish.favorite ? (
          <span
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-ground/70 text-offer backdrop-blur"
            title="Favorit"
          >
            <Heart size={16} fill="currentColor" aria-label="Favorit" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display text-[18px] font-bold leading-tight">{dish.name}</h3>
        <p className="m-0 text-sm text-muted">{dish.category}</p>
        <p className="m-0 mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1.5 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Clock size={14} aria-hidden="true" />
            {dish.prepMinutes} min
          </span>
          <span className={tried ? "" : "text-new"}>{lastLabel}</span>
        </p>
      </div>
    </a>
  );
}
