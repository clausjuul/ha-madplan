import { useMemo, useState } from "react";
import type { InspirationRecipe } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { useRoute } from "@/hooks/use-route";
import { notify } from "@/lib/notify";

/** Save-for-later and add-to-our-dishes, shared by every list of inspiration cards. */
export function useInspirationActions(saved: InspirationRecipe[]) {
  const actions = useDishActions();
  const { navigate } = useRoute();
  const [adding, setAdding] = useState<string | undefined>();
  const savedIds = useMemo(() => new Set(saved.map((recipe) => recipe.id)), [saved]);

  const toggleSave = (recipe: InspirationRecipe): void => {
    const next = savedIds.has(recipe.id) ? saved.filter((item) => item.id !== recipe.id) : [...saved, recipe];
    actions.saveInspirations(next).catch((error: unknown) => notify(errorMessage(error)));
  };

  const add = (recipe: InspirationRecipe): void => {
    setAdding(recipe.id);
    actions
      .importInspiration(recipe)
      .then((dish) => {
        notify(`${dish.name} er tilføjet til dine retter.`);
        navigate({ name: "retter", dishId: dish.id });
      })
      .catch((error: unknown) => notify(errorMessage(error)))
      .finally(() => setAdding(undefined));
  };

  return { savedIds, adding, toggleSave, add };
}
