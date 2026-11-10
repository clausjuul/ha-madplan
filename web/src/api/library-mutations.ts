import { useQueryClient } from "@tanstack/react-query";
import type {
  BootstrapResponse,
  Dish,
  DishInput,
  FridgeItem,
  InspirationRecipe,
  Profile,
  Settings,
} from "@madplan/domain";
import { notify } from "@/lib/notify";
import { ApiRequestError } from "./client";
import { useApi } from "./provider";
import { queryKeys } from "./queries";

export const errorMessage = (error: unknown): string =>
  error instanceof ApiRequestError ? error.message : "Det lykkedes ikke. Prøv igen.";

/** Dish and inspiration calls. Each rejects with the original error so forms can show the Danish message. */
export function useDishActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
  const after = <T,>(promise: Promise<T>): Promise<T> => promise.finally(() => void refresh());

  return {
    create: (input: DishInput): Promise<Dish> => after(api.createDish(input)),
    update: (id: string, input: DishInput): Promise<Dish> => after(api.updateDish(id, input)),
    archive: (id: string): Promise<Dish> => after(api.archiveDish(id)),
    restore: (id: string): Promise<Dish> => after(api.restoreDish(id)),
    importUrl: (url: string): Promise<Dish> => after(api.importDishFromUrl({ url })),
    importInspiration: (recipe: InspirationRecipe): Promise<Dish> => after(api.importInspiration(recipe)),
    saveInspirations: (recipes: InspirationRecipe[]): Promise<InspirationRecipe[]> =>
      after(api.saveInspirations(recipes)),
  };
}

type Household = Pick<BootstrapResponse, "profiles" | "fridge" | "pantry" | "settings">;

/** Replace-as-a-whole saves for household data with an optimistic cache update and rollback on failure. */
export function useHouseholdActions() {
  const api = useApi();
  const queryClient = useQueryClient();

  async function save<K extends keyof Household>(
    key: K,
    value: Household[K],
    call: (value: Household[K]) => Promise<unknown>,
  ): Promise<void> {
    await queryClient.cancelQueries({ queryKey: queryKeys.bootstrap });
    const previous = queryClient.getQueryData<BootstrapResponse>(queryKeys.bootstrap);
    if (previous) queryClient.setQueryData<BootstrapResponse>(queryKeys.bootstrap, { ...previous, [key]: value });
    try {
      await call(value);
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKeys.bootstrap, previous);
      notify(errorMessage(error));
    } finally {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    }
  }

  return {
    saveProfiles: (profiles: Profile[]) => save("profiles", profiles, (value) => api.putProfiles(value)),
    saveFridge: (items: FridgeItem[]) => save("fridge", items, (value) => api.putFridge(value)),
    savePantry: (items: string[]) => save("pantry", items, (value) => api.putPantry(value)),
    saveSettings: (settings: Settings) => save("settings", settings, (value) => api.putSettings(value)),
  };
}
