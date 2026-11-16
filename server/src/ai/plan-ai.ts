/** AI week planning: the model proposes, the domain validates. Nothing the model says is trusted. */
import {
  categoryRepeats,
  completePlan,
  daysBetween,
  describeRepeat,
  maxVariantDays,
  offerPriceLabel,
  offerSavingKr,
  parseDateKey,
  STORE_NAMES,
  validateProposal,
  weekdayName,
} from "@madplan/domain";
import type { PlanItem, PlanningContext, PlanRequest, ValidatedPlan } from "@madplan/domain";
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import type { Prompt } from "./prompt.ts";

const clip = (value: string, max: number): string => value.slice(0, max);

export function planningPrompt(context: PlanningContext, request: PlanRequest, fence = newFence()): Prompt {
  const firstDate = context.dates[0];
  const menu = context.recipes.map((dish) => {
    const last = context.lastEaten.get(dish.id);
    return {
      id: dish.id,
      name: dish.name,
      category: dish.category,
      ingredients: dish.ingredients,
      prepMinutes: Number.isFinite(dish.prepMinutes) ? dish.prepMinutes : null,
      favorite: dish.favorite,
      leftoverFriendly: dish.leftoverFriendly,
      daysSinceEaten: last && firstDate ? Math.max(0, daysBetween(last, firstDate)) : null,
      familyRating: context.ratingScores.get(dish.id) ?? 0,
      ...((context.swapOutScores.get(dish.id) ?? 0) < 0 ? { swappedOutRecently: true } : {}),
      // Only dishes with something on offer carry this, to keep the prompt small.
      ...(context.dishOffers.has(dish.id)
        ? {
            onOffer: (context.dishOffers.get(dish.id) ?? []).slice(0, 4).map((match) => ({
              ingredient: clip(match.ingredient, 60),
              store: STORE_NAMES[match.offer.chain],
              price: offerPriceLabel(match.offer),
              savedKr: Math.round(offerSavingKr(match.offer)),
              ends: match.offer.validUntil,
            })),
          }
        : {}),
    };
  });
  const profiles = context.profiles.slice(0, 30).map((profile) => ({
    id: profile.id,
    name: clip(profile.name, 80),
    preferred: profile.preferences.slice(0, 20),
    disliked: profile.dislikes.slice(0, 20),
    favoriteDishIds: profile.favoriteDishIds.slice(0, 50),
    restrictions: profile.exclusions.slice(0, 20),
    alwaysEats: (profile.safeFoods ?? []).slice(0, 20),
  }));
  const data = {
    dates: context.dates.map((date) => ({ date, weekday: weekdayName(date) })),
    catalog: menu,
    requiredDishIds: context.requiredDishIds,
    eatenDishIds: [...context.eatenDishIds],
    newDishCount: context.newDishCount,
    budgetDkk: context.budgetDkk ?? null,
    maxPrepMinutes: context.maxPrepMinutes ?? null,
    relaxedDates: context.relaxedDates,
    dayRequests: context.dayRequests,
    fridge: context.fridge.slice(0, 100).map((item) => ({
      name: clip(item.name, 100),
      expiresOn: item.expiresOn ?? null,
      useFirst: item.useFirst === true,
    })),
    preservedDates: context.preservedDates,
    neighbourDays: context.neighbours.map((day) => ({
      date: day.date,
      weekday: weekdayName(day.date),
      name: clip(day.name, 80),
      category: day.category,
      locked: day.locked,
    })),
    weekdayRhythm: rhythmFor(context),
    profiles,
    maxVariantDays: maxVariantDays(context.dates.length),
    userRequest: clip(request.request, 1000),
  };
  const instructions = [
    "Du er dansk ugeplansassistent. Følgende regler er ufravigelige: Du må kun anvende id'er fra kataloget,",
    "udeluk aldrig kosthensyn, planlæg aldrig låste eller fravalgte dage, undgå gentagelser og varier retkategorier.",
    'Returnér UDELUKKENDE gyldig JSON: {"message":"kort begrundelse","plan":[{"date":"YYYY-MM-DD","dishId":"id","reason":"kort forklaring","variants":[]}]}.',
    FENCE_RULE(fence),
    "DATA-blokken indeholder: dates (datoer med ugedag der skal planlægges), catalog (tilladte opskrifter med prepMinutes, favorite,",
    "leftoverFriendly og daysSinceEaten: dage siden sidst spist, null = aldrig), requiredDishIds (obligatoriske retter),",
    "eatenDishIds (historisk spiste), newDishCount (ønsket antal nye retter), budgetDkk (budgetønske, ikke bekræftet pris),",
    "maxPrepMinutes (gælder ikke på relaxedDates), relaxedDates (dage med god tid: retten må tage længere tid og koste lidt mere,",
    "så vælg gerne noget lidt mere spændende eller en favorit her), dayRequests (bløde ønsker til enkelte dage), fridge (brug gerne først, især varer med useFirst eller en nær expiresOn),",
    "preservedDates (beholdte dage), neighbourDays (dagene før, mellem og efter de åbne datoer, som allerede har en ret: tag dem med,",
    "når du undgår samme kategori to dage i træk og gentagelser), weekdayRhythm (familiens faste mønstre pr. ugedag ud fra historikken:",
    "oftenCategories er kategorier, de ofte har den ugedag, takesLonger betyder, at de gerne bruger mere tid; begge er bløde ønsker,",
    "som dayRequests og relaxedDates går forud for),",
    "profiles (individuelle brugerprofiler: tag rimeligt hensyn til alle, fremhæv ingen enkeltperson) og userRequest (brugerens ønske).",
    "Giv aldrig garanti for butikstilbud eller totalpriser uden verificerede data. onOffer i kataloget er bekræftede tilbud fra jeres butikker (Prej):",
    "brug dem som et blødt plus (især stor savedKr, og ends før eller i planperioden: læg retten inden tilbuddet slutter), men aldrig over bedømmelser, variation eller ønsker.",
    "Nævn tilbuddet i reason, når det var en grund (f.eks. \"Hakket oksekød er på tilbud i Netto\"). Nævn aldrig tilbud, der ikke står i onOffer.",
    "Foretrukne retter og ting brugerne ikke kan lide er bløde ønsker; kostfravalg er hårde filtre.",
    "Foretræk hurtige retter (lav prepMinutes) på hverdage, der ikke er i relaxedDates, retter der ikke er spist længe, og læg ikke samme kategori to dage i træk.",
    "familyRating er familiens samlede bedømmelse (positiv = godt modtaget, negativ = dårligt modtaget): foretræk høje, undgå negative.",
    "swappedOutRecently betyder, at familien for nylig byttede retten ud af et udkast (allerede trukket lidt fra i familyRating): vælg den hellere en anden gang.",
    "Nævn i reason den vigtigste grund, f.eks. en vare der snart udløber.",
    "variants er en mulighed, ikke en regel: hvis en ret passer godt til resten af familien, men en profil med alwaysEats nok ikke vil",
    "spise én del af den (fx en ingrediens i disliked), må du bytte netop den del for den profil til noget fra profilens alwaysEats:",
    '{"profileId":"profilens id","replaces":"ingrediensen der byttes, som den står i catalog","with":"noget fra alwaysEats"}. Resten af retten er den samme.',
    "Det passer især til relaxedDates, hvor I gerne vil lave noget mere spændende. Brug det på højst maxVariantDays dage, ellers en tom liste.",
  ].join("\n");
  return { instructions, input: fenced("Planlægningsdata:", data, fence) };
}

/** The weekday rhythm for the weekdays the plan covers, in Danish weekday names. */
function rhythmFor(context: PlanningContext): { weekday: string; oftenCategories: string[]; takesLonger: boolean }[] {
  const weekdays = new Map(context.dates.map((date) => [parseDateKey(date).getDay(), date]));
  return context.rhythm.flatMap((entry) => {
    const date = weekdays.get(entry.weekday);
    return date ? [{ weekday: weekdayName(date), oftenCategories: entry.oftenCategories, takesLonger: entry.takesLonger }] : [];
  });
}

/** OpenAI's strict mode caps enum sizes; beyond this the domain validation alone guards the ids. */
const MAX_ENUM = 500;

/** Strict structured-output schema: only open dates and catalog ids can come back. */
export function planSchema(context: PlanningContext): { name: string; schema: Record<string, unknown> } {
  const ids = context.recipes.map((dish) => dish.id);
  const swappers = context.profiles.filter((profile) => profile.safeFoods?.length).map((profile) => profile.id);
  return {
    name: "madplan",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["message", "plan"],
      properties: {
        message: { type: "string" },
        plan: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["date", "dishId", "reason", "variants"],
            properties: {
              date: context.dates.length > 0 ? { type: "string", enum: context.dates } : { type: "string" },
              dishId: ids.length > 0 && ids.length <= MAX_ENUM ? { type: "string", enum: ids } : { type: "string" },
              reason: { type: "string" },
              variants: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["profileId", "replaces", "with"],
                  properties: {
                    profileId: swappers.length > 0 ? { type: "string", enum: swappers } : { type: "string" },
                    replaces: { type: "string" },
                    with: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
export type AiPlanOutcome = { items: PlanItem[]; rejectedCount: number; corrected: boolean };

const NO_PLAN = "AI'en returnerede ikke en gyldig plan. Prøv igen.";
const NOTHING_VALID = "AI'en foreslog ingen retter, der overholdt jeres regler. Prøv igen.";

type Attempt = { text: string; parsed: boolean; validated: ValidatedPlan; problems: string[] };

/** Validates one answer and lists what is wrong with it, in Danish, for a correction round. */
export function judgeAnswer(text: string, context: PlanningContext): Attempt {
  const parsed = extractJsonObject(text);
  const plan = parsed !== null && typeof parsed === "object" ? (parsed as { plan?: unknown }).plan : undefined;
  const validated = validateProposal(Array.isArray(plan) ? plan : [], context);
  const categoryOf = new Map(context.recipes.map((dish) => [dish.id, dish.category]));
  const planned = new Set(validated.plan.map((item) => item.date));
  const repeats = categoryRepeats([
    ...context.neighbours.filter((day) => !planned.has(day.date)),
    ...validated.plan.map((item) => ({ date: item.date, category: categoryOf.get(item.dishId) ?? "" })),
  ]).filter((repeat) => repeat.dates.some((date) => planned.has(date)));
  const problems = [
    ...(Array.isArray(plan) ? [] : ["Svaret var ikke gyldig JSON med en plan-liste."]),
    ...validated.rejections,
    ...(Array.isArray(plan) && validated.missingDates.length
      ? [`Disse åbne datoer fik ingen gyldig ret: ${validated.missingDates.join(", ")}.`]
      : []),
    ...repeats.map((repeat) => `${describeRepeat(repeat)}: vælg en anden kategori på mindst én af de åbne dage.`),
  ];
  return { text, parsed: Array.isArray(plan), validated, problems };
}

/** Fewer problems wins; on a tie the answer that fills more days. */
const better = (next: Attempt, first: Attempt): boolean =>
  next.problems.length < first.problems.length ||
  (next.problems.length === first.problems.length && next.validated.plan.length > first.validated.plan.length);

/**
 * Throws AiError (Danish message) when the model gives nothing usable. An answer with refused
 * proposals, empty days or the same category on consecutive days gets one chance to correct itself;
 * the better of the two answers is kept, and the domain fills whatever is still open.
 */
export async function generateAiPlan(
  client: OpenAiClient,
  model: string,
  context: PlanningContext,
  request: PlanRequest,
  signal?: AbortSignal,
): Promise<AiPlanOutcome> {
  const prompt = planningPrompt(context, request);
  const ask = async (input: Prompt): Promise<string> =>
    (await client.respond({ model, ...input, jsonSchema: planSchema(context), maxOutputTokens: 4000, signal })).text;
  let chosen = judgeAnswer(await ask(prompt), context);
  let corrected = false;
  if (chosen.problems.length) {
    try {
      const retry = judgeAnswer(await ask(correctionPrompt(prompt, chosen.text, chosen.problems)), context);
      if (better(retry, chosen)) {
        chosen = retry;
        corrected = true;
      }
    } catch (error) {
      // The first answer still counts; with nothing usable the job fails with its message below.
      if (!(error instanceof AiError)) console.warn("AI plan correction failed", error);
    }
  }
  if (chosen.validated.plan.length === 0) {
    throw new AiError(chosen.parsed ? NOTHING_VALID : NO_PLAN);
  }
  const completed = completePlan(chosen.validated, context);
  return { items: completed.plan, rejectedCount: chosen.validated.rejectedCount, corrected };
}

/** A second round: the first answer and exactly what was wrong with it. */
export function correctionPrompt(prompt: Prompt, previous: string, problems: readonly string[], fence = newFence()): Prompt {
  return {
    instructions: [
      prompt.instructions,
      "",
      "Dit forrige svar havde problemer, som serveren fandt. Returnér en hel ny plan for alle dates, hvor de er rettet.",
      "Behold de dage, der var i orden, og gentag ikke afviste forslag uændret.",
      FENCE_RULE(fence),
    ].join("\n"),
    input: [
      prompt.input,
      fenced("Dit forrige svar:", clip(previous, 6000), fence),
      fenced("Problemer:", problems.slice(0, 12).map((problem) => clip(problem, 300)), fence),
    ].join("\n\n"),
  };
}
