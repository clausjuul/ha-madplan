import { useState } from "react";
import { useBootstrap } from "@/api/queries";
import { useCurrentDraft, useDraftActions } from "@/api/draft-mutations";
import { useRoute } from "@/hooks/use-route";
import { useToday } from "@/hooks/use-today";
import { notify } from "@/lib/notify";
import { mondayOf } from "@/lib/route";
import { planTitle } from "@/lib/plan-form";
import { ErrorState } from "@/components/ui/StatusViews";
import type { PlanRequest } from "@madplan/domain";
import { FailedView } from "./FailedView";
import { GeneratingView } from "./GeneratingView";
import { PlanShell } from "./PlanShell";
import { PlanWizard } from "./PlanWizard";
import { ReviewStep } from "./ReviewStep";

/**
 * `#/planlaeg`: resumes the current draft from the server (so it survives reloads and other devices),
 * otherwise walks through the days and wishes steps.
 */
export function PlanFlow() {
  const today = useToday();
  const { navigate } = useRoute();
  const bootstrap = useBootstrap();
  const current = useCurrentDraft();
  const actions = useDraftActions();
  const [editing, setEditing] = useState(false);
  const [seed, setSeed] = useState<PlanRequest | null>(null);
  const noop = (): void => undefined;

  const data = bootstrap.data;
  if (bootstrap.isError && !data) return <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  if (current.isError && current.data === undefined) return <ErrorState error={current.error} onRetry={() => void current.refetch()} />;
  if (!data || current.data === undefined) {
    return (
      <PlanShell title="Planlæg uge" step={1} reached={1} onStep={noop} saved={false}>
        <div className="flex flex-1 items-center justify-center text-muted" role="status">Henter kladden…</div>
      </PlanShell>
    );
  }

  const draft = current.data;
  const wizardOpen = editing || draft === null;
  const create = async (request: PlanRequest): Promise<void> => {
    if (await actions.create(request)) {
      setEditing(false);
      setSeed(null);
    }
  };
  const discard = async (rememberWishes: boolean): Promise<void> => {
    if (!draft) return;
    const request = draft.request;
    if (await actions.discard(draft.id)) {
      setSeed(rememberWishes ? request : null);
      setEditing(false);
    }
  };

  if (wizardOpen) {
    return (
      <PlanWizard
        key={draft?.id ?? (seed ? "seed" : "new")}
        data={data}
        today={today}
        draft={draft}
        seed={seed}
        busy={actions.busy}
        onSubmit={(request) => void create(request)}
        onBackToDraft={() => setEditing(false)}
      />
    );
  }

  const dates = draft.days.map((day) => day.date);
  const title = planTitle(dates.length ? dates : [draft.request.from], today);
  const openWizard = (step: number): void => {
    if (step < 3) setEditing(true);
  };
  const apply = async (): Promise<void> => {
    const first = dates[0];
    if (!(await actions.apply(draft.id))) return;
    notify("Planen er gemt i ugeplanen.");
    navigate({ name: "uge", ...(first ? { week: mondayOf(first) } : {}) });
  };

  return (
    <PlanShell title={title} step={3} reached={3} onStep={openWizard} saved>
      {draft.status === "generating" ? (
        <GeneratingView draft={draft} busy={actions.busy} onCancel={() => void discard(true)} />
      ) : draft.status === "failed" ? (
        <FailedView
          draft={draft}
          busy={actions.busy}
          onRetry={() => void (draft.days.length > 0 ? actions.regenerate(draft.id) : actions.create(draft.request))}
          onUseLocal={() => void actions.create({ ...draft.request, engine: "local" })}
          onDiscard={() => void discard(true)}
        />
      ) : (
        <ReviewStep draft={draft} data={data} today={today} actions={actions} onApply={() => void apply()} onDiscard={() => void discard(false)} />
      )}
    </PlanShell>
  );
}
