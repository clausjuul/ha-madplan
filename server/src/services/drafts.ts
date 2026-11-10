import { randomUUID } from "node:crypto";
import { checkFeasibility } from "@madplan/domain";
import type {
  Dish,
  DraftDay,
  DraftDayPatch,
  MealMap,
  PlanDraftRecord,
  PlanRequest,
} from "@madplan/domain";
import { AiError } from "../ai/openai.ts";
import { generateAiPlan } from "../ai/plan-ai.ts";
import type { Deps } from "../deps.ts";
import { conflict, notFound, unavailable, unprocessable } from "../errors.ts";
import { snapshot } from "../state.ts";
import { findDish, saveDish } from "../store-dishes.ts";
import { currentDraft, deleteDraft, failGeneratingDrafts, getDraft, replaceDraft, saveDraft } from "../store-drafts.ts";
import { getMeals, putMeal } from "../store-meals.ts";
import { assemble, dayDishId, localItems, prepare, review, windowDates } from "./draft-plan.ts";

const NO_AI = "Tilføj en OpenAI API-nøgle i appens konfiguration for at bruge AI-planlægning.";

type Job = {
  id: string;
  createdAt: string;
  request: PlanRequest;
  /** Dates the planner may fill. */
  dates: string[];
  /** Days that stay exactly as they are (regenerate only). */
  pinned?: DraftDay[];
  /** What the draft looked like before, used to restore days if an AI regeneration fails. */
  previous?: PlanDraftRecord;
};

/** Plans synchronously with the local engine. */
function produceLocal(deps: Deps, job: Job): PlanDraftRecord {
  const state = snapshot(deps);
  const prep = prepare(state, job.request, job.dates, job.pinned);
  const days = assemble(localItems(state, job.request, prep), prep, job.pinned);
  return {
    id: job.id,
    createdAt: job.createdAt,
    status: "ready",
    engine: "local",
    request: job.request,
    days,
    review: review(state, prep, days),
  };
}

/** Runs in the background; ends in "ready" or "failed" and never falls back to the local engine. */
async function produceAi(deps: Deps, job: Job): Promise<void> {
  const { repo } = deps;
  let outcome: PlanDraftRecord;
  try {
    const state = snapshot(deps);
    const prep = prepare(state, job.request, job.dates, job.pinned);
    const result = await generateAiPlan(
      deps.openai,
      deps.config.planModel,
      prep.context,
      job.request,
      AbortSignal.timeout(120_000),
    );
    const days = assemble(result.items, prep, job.pinned);
    outcome = {
      id: job.id,
      createdAt: job.createdAt,
      status: "ready",
      engine: "ai",
      request: job.request,
      days,
      review: review(state, prep, days, result.rejectedCount),
    };
  } catch (error) {
    const message =
      error instanceof AiError ? error.message : "AI-planlægningen fejlede uventet. Prøv igen.";
    if (!(error instanceof AiError)) console.error("AI planning failed", error);
    outcome = {
      id: job.id,
      createdAt: job.createdAt,
      status: "failed",
      engine: job.previous?.engine ?? "ai",
      request: job.request,
      days: job.previous?.days ?? [],
      review: job.previous?.review ?? null,
      error: message,
    };
  }
  // The user may have discarded or replaced the draft while the model was thinking.
  if (getDraft(repo.db, job.id)?.status !== "generating") return;
  repo.mutate(["drafts"], () => saveDraft(repo.db, outcome));
}

function start(deps: Deps, job: Job): PlanDraftRecord {
  const { repo } = deps;
  if (job.request.engine === "local") {
    const record = produceLocal(deps, job);
    repo.mutate(["drafts"], () => replaceDraft(repo.db, record));
    return record;
  }
  if (!deps.openai.configured) throw unavailable(NO_AI);
  const generating: PlanDraftRecord = {
    id: job.id,
    createdAt: job.createdAt,
    status: "generating",
    engine: "ai",
    request: job.request,
    days: job.previous?.days ?? [],
    review: job.previous?.review ?? null,
  };
  repo.mutate(["drafts"], () => replaceDraft(repo.db, generating));
  deps.jobs.start(produceAi(deps, job));
  return generating;
}

export function createDraft(deps: Deps, request: PlanRequest): PlanDraftRecord {
  if (request.engine === "ai" && !deps.openai.configured) throw unavailable(NO_AI);
  const state = snapshot(deps);
  const dates = windowDates(request, state.today);
  const feasibility = checkFeasibility({
    dates,
    meals: state.meals,
    requiredDishIds: request.requiredDishIds,
    newDishCount: request.newDishCount,
  });
  if (!feasibility.ok) throw unprocessable(feasibility.message ?? "Planen kan ikke laves med de valgte indstillinger.");
  return start(deps, { id: randomUUID(), createdAt: deps.now().toISOString(), request, dates });
}

function need(deps: Deps, id: string): PlanDraftRecord {
  const draft = getDraft(deps.repo.db, id);
  if (!draft) throw notFound("Planudkastet findes ikke (mere).");
  return draft;
}

export const INTERRUPTED_MESSAGE = "Planlægningen blev afbrudt, fordi appen genstartede. Prøv igen.";

/** Call once at startup, before serving: no background job survives a restart. */
export function failInterruptedDrafts(repo: Deps["repo"]): number {
  const waiting = currentDraft(repo.db)?.status === "generating";
  if (!waiting) return 0;
  return repo.mutate(["drafts"], () => failGeneratingDrafts(repo.db, INTERRUPTED_MESSAGE));
}

export const getCurrentDraft = (deps: Deps): PlanDraftRecord | null => currentDraft(deps.repo.db);

export function regenerateDraft(deps: Deps, id: string, only?: string[]): PlanDraftRecord {
  const draft = need(deps, id);
  if (draft.status === "generating") throw conflict("Planen er stadig ved at blive lavet.");
  const state = snapshot(deps);
  const open = new Set([...windowDates(draft.request, state.today), ...draft.days.map((day) => day.date)]);
  const targets = [...open].filter((date) => {
    const day = draft.days.find((candidate) => candidate.date === date);
    return !day?.locked && (only === undefined || only.includes(date));
  });
  if (targets.length === 0) throw conflict("Alle de valgte dage er låst, så der er intet at lave om.");
  const pinned = draft.days.filter((day) => !targets.includes(day.date));
  return start(deps, {
    id: draft.id,
    createdAt: draft.createdAt,
    request: draft.request,
    dates: targets,
    pinned,
    previous: draft,
  });
}

export function patchDraftDay(deps: Deps, id: string, date: string, patch: DraftDayPatch): PlanDraftRecord {
  const draft = need(deps, id);
  if (draft.status === "generating") throw conflict("Planen er stadig ved at blive lavet.");
  const index = draft.days.findIndex((day) => day.date === date);
  const day = draft.days[index];
  if (!day) throw notFound("Dagen er ikke med i planudkastet.");
  let next: DraftDay = day;
  if (patch.dishId !== undefined && patch.dishId !== dayDishId(day)) {
    const dish = findDish(deps.repo.db, patch.dishId);
    if (!dish || dish.archivedAt) throw unprocessable("Retten findes ikke eller er arkiveret.");
    next = { date, dishId: dish.id, reason: "Valgt manuelt.", locked: day.locked, source: "manual" };
  }
  if (patch.locked !== undefined) next = { ...next, locked: patch.locked };
  const days = draft.days.map((candidate, position) => (position === index ? next : candidate));
  const state = snapshot(deps);
  const pinned = days.filter((candidate) => candidate.locked);
  const dates = [...new Set([...windowDates(draft.request, state.today), ...days.map((d) => d.date)])];
  const prep = prepare(state, draft.request, dates, pinned);
  const updated: PlanDraftRecord = {
    ...draft,
    days,
    review: review(state, prep, days, draft.review?.rejectedSuggestions ?? 0),
  };
  deps.repo.mutate(["drafts"], () => saveDraft(deps.repo.db, updated));
  return updated;
}

export function applyDraft(deps: Deps, id: string): { meals: MealMap; addedDishes: Dish[] } {
  const { repo } = deps;
  const draft = need(deps, id);
  if (draft.status !== "ready") throw conflict("Planen er ikke klar til at blive brugt endnu.");
  return repo.mutate(["meals", "dishes", "drafts", "shopping"], () => {
    const existing = getMeals(repo.db);
    const applied: MealMap = {};
    const addedDishes: Dish[] = [];
    for (const day of draft.days) {
      const current = existing[day.date];
      if (current?.locked) {
        applied[day.date] = current;
        continue;
      }
      if (day.newDish && !findDish(repo.db, day.newDish.id)) {
        const dish: Dish = { ...day.newDish, custom: true };
        saveDish(repo.db, dish);
        addedDishes.push(dish);
      }
      const dishId = dayDishId(day);
      if (current && current.dishId === dishId && !current.skipped) {
        applied[day.date] = current;
        continue;
      }
      const meal = {
        dishId,
        locked: day.locked,
        note: "",
        source: day.source,
        reason: day.reason,
        ...(day.offer ? { offer: day.offer } : {}),
      };
      putMeal(repo.db, day.date, meal);
      applied[day.date] = meal;
    }
    deleteDraft(repo.db, id);
    return { meals: applied, addedDishes };
  });
}

export function discardDraft(deps: Deps, id: string): void {
  need(deps, id);
  deps.repo.mutate(["drafts"], () => deleteDraft(deps.repo.db, id));
}
