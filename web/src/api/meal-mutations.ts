import { useMutation, useQueryClient } from "@tanstack/react-query";
import { weekdayName, type BootstrapResponse, type Dish, type Meal, type MealInput, type MealMap } from "@madplan/domain";
import { notify } from "@/lib/notify";
import {
  canSwap,
  mealFromInput,
  patchMealIn,
  removeMealFrom,
  swapMealsIn,
} from "@/lib/meal-ops";
import { ApiRequestError } from "./client";
import { useApi } from "./provider";
import { queryKeys } from "./queries";

type Snapshot = { previous: BootstrapResponse | undefined };

const messageOf = (error: unknown): string =>
  error instanceof ApiRequestError ? error.message : "Det lykkedes ikke. Prøv igen.";

/**
 * Meal mutation with an optimistic update of the bootstrap cache.
 * On failure the previous state is restored and a gentle message is shown; afterwards the cache is revalidated.
 */
function useMealMutation<Vars>(
  mutationFn: (vars: Vars) => Promise<unknown>,
  apply: (meals: MealMap, vars: Vars) => MealMap,
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, Vars, Snapshot>({
    mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.bootstrap });
      const previous = queryClient.getQueryData<BootstrapResponse>(queryKeys.bootstrap);
      if (previous) {
        queryClient.setQueryData<BootstrapResponse>(queryKeys.bootstrap, {
          ...previous,
          meals: apply(previous.meals, vars),
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.bootstrap, context.previous);
      notify(messageOf(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    },
  });
}

export type MealActions = {
  setMeal: (date: string, input: MealInput) => void;
  patchMeal: (date: string, patch: Partial<MealInput>) => void;
  removeMeal: (date: string) => void;
  /** Refuses (with a message) when either day is locked. Resolves true when the swap was attempted. */
  swap: (a: string, b: string) => Promise<boolean>;
  suggest: (date: string) => void;
  busy: boolean;
};

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase("da-DK") + value.slice(1);

/** `dishes` names the dishes in the "Fortryd" messages after removing or replacing a meal. */
export function useMealActions(meals: MealMap | undefined, dishes?: readonly Dish[]): MealActions {
  const api = useApi();
  const queryClient = useQueryClient();

  const set = useMealMutation(
    (vars: { date: string; input: MealInput }) => api.putMeal(vars.date, vars.input),
    (current, vars) => ({ ...current, [vars.date]: mealFromInput(vars.input) }),
  );
  const patch = useMealMutation(
    (vars: { date: string; patch: Partial<MealInput> }) => api.patchMeal(vars.date, vars.patch),
    (current, vars) => patchMealIn(current, vars.date, vars.patch),
  );
  const remove = useMealMutation(
    (date: string) => api.deleteMeal(date),
    (current, date) => removeMealFrom(current, date),
  );
  const swapMutation = useMealMutation(
    (vars: { a: string; b: string }) => api.swapMeals(vars),
    (current, vars) => swapMealsIn(current, vars.a, vars.b),
  );
  const suggestMutation = useMutation({
    mutationFn: (date: string) => api.suggestMeal(date, { seed: Math.floor(Math.random() * 1e9) }),
    onError: (error) => notify(messageOf(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    },
  });

  const nameOf = (dishId: string): string => dishes?.find((dish) => dish.id === dishId)?.name ?? "Retten";
  /** Puts a day back the way it was before a removal or a suggestion. */
  const restore = (date: string, previous: Meal | undefined): void => {
    if (previous) set.mutate({ date, input: previous });
    else remove.mutate(date);
  };

  return {
    setMeal: (date, input) => set.mutate({ date, input }),
    patchMeal: (date, changes) => patch.mutate({ date, patch: changes }),
    removeMeal: (date) => {
      const previous = meals?.[date];
      remove.mutate(date, {
        onSuccess: () => {
          if (!previous) return;
          notify(`${nameOf(previous.dishId)} er fjernet fra ${weekdayName(date)}.`, 6000, {
            label: "Fortryd",
            run: () => restore(date, previous),
          });
        },
      });
    },
    swap: async (a, b) => {
      const check = canSwap(meals ?? {}, a, b);
      if (!check.ok) {
        notify(check.message);
        return false;
      }
      await swapMutation.mutateAsync({ a, b }).catch(() => undefined);
      return true;
    },
    suggest: (date) => {
      const previous = meals?.[date];
      suggestMutation.mutate(date, {
        onSuccess: (meal) => {
          const day = capitalize(weekdayName(date));
          const text = previous && previous.dishId !== meal.dishId
            ? `${day}: ${nameOf(meal.dishId)} i stedet for ${nameOf(previous.dishId)}.`
            : `${day}: ${nameOf(meal.dishId)}.`;
          notify(text, 6000, { label: "Fortryd", run: () => restore(date, previous) });
        },
      });
    },
    busy: suggestMutation.isPending,
  };
}
