import {
  addDaysToKey,
  checkFeasibility,
  isoWeekNumber,
  parseDateKey,
  planningDays,
  type MealMap,
  type PlanEngine,
  type PlanRequest,
} from "@madplan/domain";
import { mondayOf } from "./route";

export const MAX_DAYS = 14;
export const MAX_NEW_DISHES = 7;
export const PREP_CHOICES: readonly { label: string; minutes: number | null }[] = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "60 min", minutes: 60 },
  { label: "Ingen grænse", minutes: null },
];

/** Everything the two first steps collect. Kept as plain strings/numbers so it is easy to edit. */
export type PlanForm = {
  from: string;
  dayCount: number;
  skippedDates: string[];
  request: string;
  dayRequests: Record<string, string>;
  requiredDishIds: string[];
  newDishCount: number;
  maxPrepMinutes: number | null;
  /** Kept as typed so an empty field stays empty. */
  budget: string;
  fridge: string[];
  engine: PlanEngine;
};

/** The local engine cannot invent dishes, so it never gets a new-dish target. */
export const effectiveNewDishCount = (form: Pick<PlanForm, "engine" | "newDishCount">): number =>
  form.engine === "local" ? 0 : form.newDishCount;

export function initialForm(today: string, fridge: readonly string[], aiAvailable: boolean): PlanForm {
  return {
    from: today,
    dayCount: 7,
    skippedDates: [],
    request: "",
    dayRequests: {},
    requiredDishIds: [],
    newDishCount: 1,
    maxPrepMinutes: null,
    budget: "",
    fridge: [...fridge],
    engine: aiAvailable ? "ai" : "local",
  };
}

/** Restores the wizard from a saved request (used when changing wishes for an existing draft). */
export function formFromRequest(request: PlanRequest, aiAvailable: boolean): PlanForm {
  return {
    from: request.from,
    dayCount: request.dayCount,
    skippedDates: [...request.skippedDates],
    request: request.request,
    dayRequests: { ...request.dayRequests },
    requiredDishIds: [...request.requiredDishIds],
    newDishCount: request.newDishCount,
    maxPrepMinutes: request.maxPrepMinutes ?? null,
    budget: request.budgetDkk ? String(request.budgetDkk) : "",
    fridge: [...(request.fridgeOverride ?? [])],
    engine: request.engine === "ai" && !aiAvailable ? "local" : request.engine,
  };
}

/** The dates the plan will cover: skipped dates are stepped over, not counted. */
export const formDates = (form: PlanForm, today: string): string[] =>
  planningDays({ start: form.from, dayCount: form.dayCount, skippedDates: form.skippedDates, today });

/** Calendar days shown in the date grid: at least two weeks, long enough to show every planned day. */
export function gridDates(form: PlanForm, today: string): string[] {
  const first = form.from < today ? today : form.from;
  const last = formDates(form, today).at(-1) ?? first;
  let length = MAX_DAYS;
  while (addDaysToKey(first, length - 1) < last) length += 1;
  return Array.from({ length }, (_, offset) => addDaysToKey(first, offset));
}

export type DateStatus = "free" | "kept" | "replaced" | "left-out";

/** What planning would do to a day that already has something on it. */
export function dateStatus(meals: MealMap, date: string): DateStatus {
  const meal = meals[date];
  if (!meal) return "free";
  if (meal.skipped) return "left-out";
  return meal.locked ? "kept" : "replaced";
}

export type StepCheck = { ok: boolean; message?: string };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Step 1: the plan needs at least one day, and a not-too-wide window. */
export function validateDays(form: PlanForm, today: string): StepCheck {
  if (form.dayCount < 1 || form.dayCount > MAX_DAYS) {
    return { ok: false, message: `Vælg mellem 1 og ${MAX_DAYS} dage.` };
  }
  if (formDates(form, today).length === 0) return { ok: false, message: "Vælg mindst én maddag, før planen laves." };
  return { ok: true };
}

/** Steps 1+2 together: can the wishes fit into the open days? Explains in Danish what to change. */
export function validateWishes(form: PlanForm, today: string, meals: MealMap): StepCheck {
  const days = validateDays(form, today);
  if (!days.ok) return days;
  const dates = formDates(form, today);
  const result = checkFeasibility({
    dates,
    meals,
    requiredDishIds: form.requiredDishIds,
    newDishCount: effectiveNewDishCount(form),
  });
  const open = result.unlockedDayCount;
  const keptCount = dates.length - open;
  if (result.ok && open > 0) return { ok: true };
  const lockNote = keptCount > 0 ? ` (${plural(keptCount, "dag er", "dage er")} låst og bevares)` : "";
  if (open === 0) {
    return { ok: false, message: `Alle de valgte dage er låst${lockNote}, så der er intet at planlægge. Vælg flere dage.` };
  }
  const wants = effectiveNewDishCount(form) + result.requiredUnlockedCount;
  return {
    ok: false,
    message:
      `Du har ${plural(open, "åben dag", "åbne dage")}${lockNote}, men beder om ` +
      `${plural(effectiveNewDishCount(form), "ny ret", "nye retter")} og ${plural(result.requiredUnlockedCount, "valgt ret", "valgte retter")} ` +
      `(${wants} i alt). Vælg flere dage, eller skær ned på antallet af nye eller valgte retter.`,
  };
}

/** "Planlæg uge 46": the ISO week of the first planned day. */
export function planTitle(dates: readonly string[], fallback: string): string {
  return `Planlæg uge ${isoWeekNumber(parseDateKey(mondayOf(dates[0] ?? fallback)))}`;
}

/** The request sent to the API. `baseFridge` is what the fridge holds now; an unchanged list is not sent as an override. */
export function toRequest(form: PlanForm, today: string, baseFridge: readonly string[]): PlanRequest {
  const dates = formDates(form, today);
  const budget = Number(form.budget.replace(",", "."));
  const sameFridge =
    form.fridge.length === baseFridge.length && form.fridge.every((name, index) => name === baseFridge[index]);
  const dayRequests: Record<string, string> = {};
  for (const [date, wish] of Object.entries(form.dayRequests)) {
    if (dates.includes(date) && wish.trim()) dayRequests[date] = wish.trim();
  }
  return {
    engine: form.engine,
    from: form.from < today ? today : form.from,
    dayCount: form.dayCount,
    skippedDates: form.skippedDates.filter((date) => date >= today),
    newDishCount: effectiveNewDishCount(form),
    requiredDishIds: form.requiredDishIds,
    request: form.request.trim(),
    dayRequests,
    ...(form.maxPrepMinutes ? { maxPrepMinutes: form.maxPrepMinutes } : {}),
    ...(Number.isFinite(budget) && budget > 0 ? { budgetDkk: Math.round(budget) } : {}),
    ...(sameFridge ? {} : { fridgeOverride: form.fridge }),
  };
}
