import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ChangeTopic, ShoppingQuery } from "@madplan/domain";
import { useApi } from "./provider";

export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  shopping: ["shopping"] as const,
  draft: ["plan-draft"] as const,
};

/** Which cached resources a change event makes stale. */
export function keysForTopics(topics: readonly ChangeTopic[]): (readonly string[])[] {
  const keys = new Set<(typeof queryKeys)[keyof typeof queryKeys]>();
  for (const topic of topics) {
    if (topic === "shopping") keys.add(queryKeys.shopping);
    else if (topic === "drafts") keys.add(queryKeys.draft);
    else keys.add(queryKeys.bootstrap);
    if (topic === "meals" || topic === "dishes" || topic === "household") keys.add(queryKeys.shopping);
  }
  return [...keys];
}

/** Weekly plans change at most a few times a day; the server caches them too. */
export function useWeeklyPlans() {
  const api = useApi();
  return useQuery({ queryKey: ["weekly-plans"], queryFn: () => api.weeklyPlans(), staleTime: 30 * 60 * 1000 });
}

export function useBootstrap() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.bootstrap, queryFn: () => api.bootstrap() });
}

/** The ONE current shopping list ("next shopping trip"). */
export function useShopping(query?: ShoppingQuery) {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.shopping, query?.from ?? "", query?.to ?? ""],
    queryFn: () => api.getShopping(query),
    placeholderData: keepPreviousData,
  });
}
