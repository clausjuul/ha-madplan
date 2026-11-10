import { useState } from "react";
import type { Dish } from "@madplan/domain";
import { dishImageSrc } from "@/lib/images";
import { dishInitial, dishSurfaceStyle } from "@/lib/dish-surface";

type Props = {
  dish: Pick<Dish, "name" | "category" | "imageKey" | "imageUrl">;
  /** Intrinsic size hint (CSS px) so the browser reserves space; layout size comes from className. */
  width: number;
  height: number;
  className?: string;
  /** Decorative when the name is shown next to it. */
  decorative?: boolean;
  eager?: boolean;
};

/** Dish photo, or a deterministic colour surface with the initial when no photo exists / it fails to load. */
export function DishImage({ dish, width, height, className = "", decorative, eager }: Props) {
  const src = dishImageSrc(dish);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        data-testid="dish-surface"
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : dish.name}
        aria-hidden={decorative ? true : undefined}
        style={dishSurfaceStyle(dish.category)}
        className={`flex select-none items-center justify-center font-display font-bold ${className}`}
      >
        <span style={{ fontSize: Math.max(18, Math.min(width, height) * 0.42) }} aria-hidden="true">
          {dishInitial(dish.name)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={decorative ? "" : dish.name}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
