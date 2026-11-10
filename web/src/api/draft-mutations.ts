import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DraftDayPatch, PlanDraftRecord, PlanRequest } from "@madplan/domain";
import { notify } from "@/lib/notify";
import { ApiRequestError } from "./client";
import { useApi } from "./provider";
import { queryKeys } from "./queries";

/** While the planner works, ask again every 3 s: covers a dropped live connection and missed events. */
export const GENERATING_POLL_MS = 3000;

/** The ONE current plan draft (null when there is none). Follows the live "drafts" topic. */
export function useCurrentDraft() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.draft,
    queryFn: () => api.currentDraft(),
    refetchInterval: (query) => (query.state.data?.status === "generating" ? GENERATING_POLL_MS : false),
  });
}

const messageOf = (error: unknown): string =>
  error instanceof ApiRequestError ? error.message : "Det lykkedes ikke. Prøv igen.";

export type DraftActions = {
  create: (request: PlanRequest) => Promise<PlanDraftRecord | undefined>;
  patchDay: (id: string, date: string, patch: DraftDayPatch) => Promise<PlanDraftRecord | undefined>;
  regenerate: (id: string, dates?: string[]) => Promise<PlanDraftRecord | undefined>;
  /** True when the plan was saved into the week. */
  apply: (id: string) => Promise<boolean>;
  /** True when the draft was discarded. */
  discard: (id: string) => Promise<boolean>;
  busy: boolean;
};

/** Draft mutations. Failures show the Danish API message as a toast and resolve to undefined/false. */
export function useDraftActions(): DraftActions {
  const api = useApi();
  const queryClient = useQueryClient();

  const store = (record: PlanDraftRecord | null): void => {
    queryClient.setQueryData(queryKeys.draft, record);
  };
  const onError = (error: unknown): void => notify(messageOf(error));
  const settle = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.draft });
  };

  const create = useMutation({ mutationFn: (request: PlanRequest) => api.createDraft(request), onSuccess: store, onError, onSettled: settle });
  const patch = useMutation({
    mutationFn: (vars: { id: string; date: string; patch: DraftDayPatch }) => api.patchDraftDay(vars.id, vars.date, vars.patch),
    onSuccess: store,
    onError,
    onSettled: settle,
  });
  const regenerate = useMutation({
    mutationFn: (vars: { id: string; dates?: string[] }) => api.regenerateDraft(vars.id, vars.dates),
    onSuccess: store,
    onError,
    onSettled: settle,
  });
  const apply = useMutation({
    mutationFn: (id: string) => api.applyDraft(id),
    onSuccess: () => {
      store(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    },
    onError,
  });
  const discard = useMutation({ mutationFn: async (id: string) => {
      await api.discardDraft(id);
      return true;
    }, onSuccess: () => store(null), onError });

  const swallow = async <T,>(run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await run();
    } catch {
      return undefined;
    }
  };

  return {
    create: (request) => swallow(() => create.mutateAsync(request)),
    patchDay: (id, date, change) => swallow(() => patch.mutateAsync({ id, date, patch: change })),
    regenerate: (id, dates) => swallow(() => regenerate.mutateAsync({ id, ...(dates ? { dates } : {}) })),
    apply: async (id) => (await swallow(() => apply.mutateAsync(id))) !== undefined,
    discard: async (id) => (await swallow(() => discard.mutateAsync(id))) !== undefined,
    busy: create.isPending || patch.isPending || regenerate.isPending || apply.isPending || discard.isPending,
  };
}
