import type { Dish } from "@madplan/domain";
import { Sheet } from "@/components/ui/Sheet";
import { DishForm } from "./DishForm";

type Props = {
  open: boolean;
  dish: Dish | undefined;
  dishes: readonly Dish[];
  aiAvailable: boolean;
  categories: readonly string[];
  onClose: () => void;
};

/** Editing a saved dish. New dishes go through AddDishSheet. */
export function DishFormSheet({ open, dish, dishes, aiAvailable, categories, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Redigér ret" tall fill>
      {dish ? <DishForm dish={dish} dishes={dishes} aiAvailable={aiAvailable} categories={categories} onClose={onClose} /> : null}
    </Sheet>
  );
}
