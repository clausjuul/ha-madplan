import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BootstrapResponse, ShoppingList } from "@madplan/domain";
import { notify } from "@/lib/notify";
import { removeItemIn, toggleItemIn } from "@/lib/shopping-view";
import { ApiRequestError } from "./client";
import { useApi } from "./provider";
import { queryKeys } from "./queries";

type Entry = [readonly unknown[], ShoppingList | undefined];
type Snapshot = { previous: Entry[] };

const messageOf = (error: unknown): string =>
  error instanceof ApiRequestError ? error.message : "Det lykkedes ikke. Prøv igen.";

const MUTATION_KEY = ["shopping-mutation"] as const;

/** Revalidates only when the last in-flight shopping mutation settles, so rapid taps do not flicker. */
function settle(queryClient: QueryClient): void {
  if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
}

/** Applies `change` to every cached shopping list (all ranges) and returns what is needed to roll back. */
async function applyOptimistic(
  queryClient: QueryClient,
  change: (list: ShoppingList) => ShoppingList,
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.shopping });
  const previous = queryClient.getQueriesData<ShoppingList>({ queryKey: queryKeys.shopping });
  queryClient.setQueriesData<ShoppingList>({ queryKey: queryKeys.shopping }, (list) => (list ? change(list) : list));
  return { previous };
}

function rollback(queryClient: QueryClient, snapshot: Snapshot | undefined): void {
  for (const [key, data] of snapshot?.previous ?? []) queryClient.setQueryData(key, data);
}

export type ShoppingActions = {
  toggle: (itemId: string) => void;
  addExtra: (label: string) => void;
  removeExtra: (itemId: string) => void;
  reset: () => Promise<void>;
  setPantry: (items: string[]) => void;
};

/**
 * Shopping mutations. Toggle and remove are optimistic with rollback (and a gentle message);
 * the rest revalidate. The server answers with the default-range list, so responses are never written
 * into the cache directly: the visible range is always refetched.
 */
export function useShoppingActions(): ShoppingActions {
  const api = useApi();
  const queryClient = useQueryClient();
  const base = { mutationKey: MUTATION_KEY, onSettled: () => settle(queryClient) };

  const toggle = useMutation<unknown, unknown, string, Snapshot>({
    ...base,
    mutationFn: (itemId) => api.toggleShoppingItem(itemId),
    onMutate: (itemId) => applyOptimistic(queryClient, (list) => toggleItemIn(list, itemId)),
    onError: (error, _id, context) => {
      rollback(queryClient, context);
      notify(messageOf(error));
    },
  });
  const remove = useMutation<unknown, unknown, string, Snapshot>({
    ...base,
    mutationFn: (itemId) => api.removeShoppingExtra(itemId),
    onMutate: (itemId) => applyOptimistic(queryClient, (list) => removeItemIn(list, itemId)),
    onError: (error, _id, context) => {
      rollback(queryClient, context);
      notify(messageOf(error));
    },
  });
  const add = useMutation({
    ...base,
    mutationFn: (label: string) => api.addShoppingExtra(label),
    onError: (error) => notify(messageOf(error)),
  });
  const reset = useMutation({
    ...base,
    mutationFn: () => api.resetShopping(),
    onError: (error) => notify(messageOf(error)),
  });
  const pantry = useMutation<unknown, unknown, string[], { previous: BootstrapResponse | undefined }>({
    mutationFn: (items) => api.putPantry(items),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.bootstrap });
      const previous = queryClient.getQueryData<BootstrapResponse>(queryKeys.bootstrap);
      if (previous) queryClient.setQueryData<BootstrapResponse>(queryKeys.bootstrap, { ...previous, pantry: items });
      return { previous };
    },
    onError: (error, _items, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.bootstrap, context.previous);
      notify(messageOf(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    },
  });

  return {
    toggle: (itemId) => toggle.mutate(itemId),
    addExtra: (label) => add.mutate(label),
    removeExtra: (itemId) => remove.mutate(itemId),
    reset: () => reset.mutateAsync().then(() => undefined, () => undefined),
    setPantry: (items) => pantry.mutate(items),
  };
}
