import {
  buildPlanningContext,
  checkFeasibility,
  createLocalSuggestions,
  eatenHistory,
  lastEatenByDish,
  planningDays,
  reviewPlan,
  toDraft,
  type ChangeTopic,
  type Dish,
  type DraftDay,
  type Meal,
  type MealMap,
  type PlanDraftRecord,
  type PlanItem,
  type PlanRequest,
} from "@madplan/domain";
import { ApiRequestError, type ApiClient } from "./client";
import type { FakeState } from "./fake-data";

type DraftMethods = Pick<
  ApiClient,
  "currentDraft" | "createDraft" | "patchDraftDay" | "regenerateDraft" | "applyDraft" | "discardDraft"
>;

type Context = {
  state: FakeState;
  today: string;
  openai: boolean;
  wait: () => Promise<void>;
  emit: (topics: ChangeTopic[]) => void;
  /** How long the demo "AI" thinks. */
  aiDelayMs: number;
};

/** Put this anywhere in the wish to see the failure screen in the demo. */
export const DEMO_FAILURE_MARKER = "[demo-fejl]";

const DEMO_NEW_DISHES: Dish[] = [
  {
    id: "demo-thai-kyllingewok",
    name: "Thai kyllingewok (demo)",
    ingredients: ["400 g kylling", "250 g nudler", "1 peberfrugt", "2 spsk. sojasovs", "2 fed hvidløg"],
    prepMinutes: 25,
    category: "Wok",
    favorite: false,
    leftoverFriendly: false,
    freezerFriendly: false,
    custom: true,
    generated: true,
  },
  {
    id: "demo-ovnbagt-torsk",
    name: "Ovnbagt torsk med citron (demo)",
    ingredients: ["600 g torsk", "1 citron", "500 g kartofler", "1 bundt dild"],
    prepMinutes: 35,
    category: "Fisk",
    favorite: false,
    leftoverFriendly: false,
    freezerFriendly: false,
    custom: true,
    generated: true,
  },
  {
    id: "demo-linsecurry",
    name: "Linsecurry med ris (demo)",
    ingredients: ["250 g røde linser", "1 dåse kokosmælk", "2 spsk. karry", "300 g ris"],
    prepMinutes: 30,
    category: "Vegetar",
    favorite: false,
    leftoverFriendly: true,
    freezerFriendly: true,
    custom: true,
    generated: true,
  },
];

const failure = (status: number, code: string, message: string): ApiRequestError =>
  new ApiRequestError(status, code, message);
const missing = (): ApiRequestError => failure(404, "not_found", "Planudkastet findes ikke (mere).");
const dayDishId = (day: DraftDay): string => day.dishId ?? day.newDish.id;

export function createFakeDrafts(ctx: Context): DraftMethods {
  const { state, today } = ctx;
  let draft: PlanDraftRecord | null = null;
  let counter = 0;

  const windowOf = (request: PlanRequest): string[] =>
    planningDays({ start: request.from, dayCount: request.dayCount, skippedDates: request.skippedDates, today });

  /** Real meals with the pinned draft days overlaid as locked, like the server does. */
  function prepare(request: PlanRequest, dates: readonly string[], pinned: readonly DraftDay[]) {
    const meals: MealMap = { ...state.meals };
    const dishes = [...state.dishes];
    for (const day of pinned) {
      if (day.newDish) dishes.push(day.newDish);
      meals[day.date] = { dishId: dayDishId(day), locked: true, note: "", source: day.source, reason: day.reason };
    }
    const eaten = eatenHistory(state.meals, today);
    const context = buildPlanningContext({
      dishes,
      dates: [...new Set([...dates, ...pinned.map((day) => day.date)])].sort(),
      meals,
      eatenDishIds: eaten.map((entry) => entry.dishId),
      requiredDishIds: request.requiredDishIds,
      newDishCount: request.newDishCount,
      request: request.request,
      dayRequests: request.dayRequests,
      budgetDkk: request.budgetDkk,
      maxPrepMinutes: request.maxPrepMinutes,
      fridge: request.fridgeOverride ? request.fridgeOverride.map((name) => ({ name })) : state.fridge,
      globalExclusions: state.settings.globalExclusions,
      profiles: state.profiles,
    });
    return { context, meals, dishes, eaten };
  }

  function produce(
    request: PlanRequest,
    dates: readonly string[],
    pinned: readonly DraftDay[],
    engine: "ai" | "local",
    avoid: ReadonlySet<string> = new Set(),
  ): Pick<PlanDraftRecord, "days" | "review"> {
    const prep = prepare(request, dates, pinned);
    const { context } = prep;
    const all = [...new Set([...context.dates, ...context.lockedDays.keys()])].sort();
    const suggestions = createLocalSuggestions({
      ratingScores: context.ratingScores,
      days: all,
      meals: prep.meals,
      fridge: context.fridge,
      lastEaten: lastEatenByDish(prep.eaten),
      seed: request.seed ?? Math.floor(Math.random() * 1_000_000_000),
      dishes: context.recipes.filter((dish) => !avoid.has(dish.id)),
      requiredDishIds: context.requiredDishIds,
      userRequest: request.request,
      dayRequests: context.dayRequests,
      globalExclusions: context.globalExclusions,
      profiles: context.profiles,
    });
    const items: PlanItem[] = suggestions.flatMap((day) =>
      day.dishId !== undefined && context.dates.includes(day.date)
        ? [{ date: day.date, dishId: day.dishId, source: engine, reason: day.reason }]
        : [],
    );
    const planned = toDraft(items, context, prep.meals).days.filter((day) => context.dates.includes(day.date));
    const kept = pinned.length > 0 ? [...pinned] : toDraft(items, context, prep.meals).days.filter((day) => !context.dates.includes(day.date));
    let days = [...planned, ...kept].sort((a, b) => a.date.localeCompare(b.date));
    if (engine === "ai") days = demoAi(days, request, new Set(kept.map((day) => day.date)));
    const reviewPrep = prepare(request, dates, days.filter((day) => day.locked));
    const review = reviewPlan({
      draft: { days },
      context: reviewPrep.context,
      dishes: [...reviewPrep.dishes, ...days.flatMap((day) => (day.newDish ? [day.newDish] : []))],
      meals: reviewPrep.meals,
      eaten: reviewPrep.eaten,
      pantry: state.pantry,
    });
    return { days, review };
  }

  /** The demo "AI" is the local engine in disguise: reasons say so, and new dishes are canned examples. */
  function demoAi(days: DraftDay[], request: PlanRequest, kept: Set<string>): DraftDay[] {
    const open = days.filter((day) => !kept.has(day.date) && !day.locked);
    const swaps = new Map<string, Dish>();
    DEMO_NEW_DISHES.slice(0, Math.min(request.newDishCount, open.length)).forEach((dish, index) => {
      const day = open[index * 2 < open.length ? index * 2 : index];
      if (day) swaps.set(day.date, dish);
    });
    return days.map((day) => {
      const dish = swaps.get(day.date);
      if (dish) return { date: day.date, newDish: dish, reason: "Demo: en ny ret, som en rigtig Assist kunne finde på nettet.", locked: false, source: "ai" };
      if (kept.has(day.date) || day.locked) return day;
      return { ...day, source: "ai", reason: `Demo (ikke rigtig AI): ${day.reason}` };
    });
  }

  function begin(
    id: string,
    createdAt: string,
    request: PlanRequest,
    dates: readonly string[],
    pinned: readonly DraftDay[],
    previous: PlanDraftRecord | null,
  ): PlanDraftRecord {
    const avoid = new Set((previous?.days ?? []).filter((day) => dates.includes(day.date)).map(dayDishId));
    if (request.engine === "local") {
      const record: PlanDraftRecord = {
        id, createdAt, status: "ready", engine: "local", request, ...produce(request, dates, pinned, "local", avoid),
      };
      draft = record;
      ctx.emit(["drafts"]);
      return structuredClone(record);
    }
    if (!ctx.openai) {
      throw failure(503, "unavailable", "Tilføj en OpenAI API-nøgle i appens konfiguration for at bruge AI-planlægning.");
    }
    const generating: PlanDraftRecord = {
      id, createdAt, status: "generating", engine: "ai", request,
      days: previous?.days ?? [], review: previous?.review ?? null,
    };
    draft = generating;
    ctx.emit(["drafts"]);
    setTimeout(() => {
      if (draft?.id !== id || draft.status !== "generating") return;
      if (request.request.includes(DEMO_FAILURE_MARKER)) {
        draft = { ...generating, status: "failed", error: "Demo: Assist svarede ikke i tide. Prøv igen om lidt." };
      } else {
        draft = { id, createdAt, status: "ready", engine: "ai", request, ...produce(request, dates, pinned, "ai", avoid) };
      }
      ctx.emit(["drafts"]);
    }, ctx.aiDelayMs);
    return structuredClone(generating);
  }

  const need = (id: string): PlanDraftRecord => {
    if (!draft || draft.id !== id) throw missing();
    return draft;
  };

  return {
    async currentDraft() {
      await ctx.wait();
      return draft ? structuredClone(draft) : null;
    },

    async createDraft(request) {
      await ctx.wait();
      const dates = windowOf(request);
      const feasibility = checkFeasibility({
        dates, meals: state.meals, requiredDishIds: request.requiredDishIds, newDishCount: request.newDishCount,
      });
      if (!feasibility.ok) {
        throw failure(422, "unprocessable", feasibility.message ?? "Planen kan ikke laves med de valgte indstillinger.");
      }
      counter += 1;
      return begin(`draft-${counter}`, new Date().toISOString(), request, dates, [], null);
    },

    async patchDraftDay(id, date, patch) {
      await ctx.wait();
      const current = need(id);
      if (current.status === "generating") throw failure(409, "conflict", "Planen er stadig ved at blive lavet.");
      const index = current.days.findIndex((day) => day.date === date);
      const day = current.days[index];
      if (!day) throw failure(404, "not_found", "Dagen er ikke med i planudkastet.");
      let next: DraftDay = day;
      if (patch.dishId !== undefined && patch.dishId !== dayDishId(day)) {
        const dish = state.dishes.find((candidate) => candidate.id === patch.dishId);
        if (!dish || dish.archivedAt) throw failure(422, "unprocessable", "Retten findes ikke eller er arkiveret.");
        next = { date, dishId: dish.id, reason: "Valgt manuelt.", locked: day.locked, source: "manual" };
      }
      if (patch.locked !== undefined) next = { ...next, locked: patch.locked };
      const days = current.days.map((candidate, position) => (position === index ? next : candidate));
      draft = { ...current, days, review: produce(current.request, windowOf(current.request), days.filter((d) => d.locked), "local").review };
      ctx.emit(["drafts"]);
      return structuredClone(draft);
    },

    async regenerateDraft(id, only) {
      await ctx.wait();
      const current = need(id);
      if (current.status === "generating") throw failure(409, "conflict", "Planen er stadig ved at blive lavet.");
      const open = new Set([...windowOf(current.request), ...current.days.map((day) => day.date)]);
      const targets = [...open].filter((date) => {
        const day = current.days.find((candidate) => candidate.date === date);
        return !day?.locked && (only === undefined || only.includes(date));
      });
      if (targets.length === 0) throw failure(409, "conflict", "Alle de valgte dage er låst, så der er intet at lave om.");
      const pinned = current.days.filter((day) => !targets.includes(day.date));
      const { seed: _seed, ...request } = current.request;
      return begin(current.id, current.createdAt, request, targets, pinned, current);
    },

    async applyDraft(id) {
      await ctx.wait();
      const current = need(id);
      if (current.status !== "ready") throw failure(409, "conflict", "Planen er ikke klar til at blive brugt endnu.");
      const applied: MealMap = {};
      const addedDishes: Dish[] = [];
      for (const day of current.days) {
        const existing = state.meals[day.date];
        if (existing?.locked) {
          applied[day.date] = existing;
          continue;
        }
        if (day.newDish && !state.dishes.some((dish) => dish.id === day.newDish.id)) {
          state.dishes.push({ ...day.newDish, custom: true });
          addedDishes.push({ ...day.newDish, custom: true });
        }
        const meal: Meal = {
          dishId: dayDishId(day), locked: day.locked, note: "", source: day.source, reason: day.reason,
          ...(day.offer ? { offer: day.offer } : {}),
        };
        state.meals[day.date] = meal;
        applied[day.date] = meal;
      }
      draft = null;
      ctx.emit(["meals", "dishes", "drafts", "shopping"]);
      return structuredClone({ meals: applied, addedDishes });
    },

    async discardDraft(id) {
      await ctx.wait();
      need(id);
      draft = null;
      ctx.emit(["drafts"]);
    },
  };
}
