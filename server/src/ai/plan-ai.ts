/** AI week planning: the model proposes, the domain validates. Nothing the model says is trusted. */
import { completePlan, validateProposal } from "@madplan/domain";
import type { PlanItem, PlanningContext, PlanRequest } from "@madplan/domain";
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import type { Prompt } from "./prompt.ts";

const clip = (value: string, max: number): string => value.slice(0, max);

export function planningPrompt(context: PlanningContext, request: PlanRequest, fence = newFence()): Prompt {
  const menu = context.recipes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    category: dish.category,
    ingredients: dish.ingredients,
  }));
  const profiles = context.profiles.slice(0, 30).map((profile) => ({
    name: clip(profile.name, 80),
    preferred: profile.preferences.slice(0, 20),
    disliked: profile.dislikes.slice(0, 20),
    favoriteDishIds: profile.favoriteDishIds.slice(0, 50),
    restrictions: profile.exclusions.slice(0, 20),
  }));
  const data = {
    dates: context.dates,
    catalog: menu,
    requiredDishIds: context.requiredDishIds,
    eatenDishIds: [...context.eatenDishIds],
    newDishCount: context.newDishCount,
    budgetDkk: context.budgetDkk ?? null,
    maxPrepMinutes: context.maxPrepMinutes ?? null,
    dayRequests: context.dayRequests,
    fridge: context.fridge.map((item) => item.name),
    preservedDates: context.preservedDates,
    profiles,
    userRequest: clip(request.request, 1000),
  };
  const instructions = [
    "Du er dansk ugeplansassistent. Følgende regler er ufravigelige: Du må kun anvende id'er fra kataloget,",
    "udeluk aldrig kosthensyn, planlæg aldrig låste eller fravalgte dage, undgå gentagelser og varier retkategorier.",
    'Returnér UDELUKKENDE gyldig JSON: {"message":"kort begrundelse","plan":[{"date":"YYYY-MM-DD","dishId":"id","reason":"kort forklaring"}]}.',
    FENCE_RULE(fence),
    "DATA-blokken indeholder: dates (datoer der skal planlægges), catalog (tilladte opskrifter), requiredDishIds (obligatoriske retter),",
    "eatenDishIds (historisk spiste), newDishCount (ønsket antal nye retter), budgetDkk (budgetønske, ikke bekræftet pris),",
    "maxPrepMinutes, dayRequests (bløde ønsker til enkelte dage), fridge (brug gerne først), preservedDates (beholdte dage),",
    "profiles (individuelle brugerprofiler: tag rimeligt hensyn til alle, fremhæv ingen enkeltperson) og userRequest (brugerens ønske).",
    "Giv aldrig garanti for butikstilbud eller totalpriser uden verificerede data.",
    "Foretrukne retter og ting brugerne ikke kan lide er bløde ønsker; kostfravalg er hårde filtre.",
  ].join("\n");
  return { instructions, input: fenced("Planlægningsdata:", data, fence) };
}
export type AiPlanOutcome = { items: PlanItem[]; rejectedCount: number };

/** Throws AiError (Danish message) when the model gives nothing usable. */
export async function generateAiPlan(
  client: OpenAiClient,
  model: string,
  context: PlanningContext,
  request: PlanRequest,
  signal?: AbortSignal,
): Promise<AiPlanOutcome> {
  const answer = await client.respond({
    model,
    ...planningPrompt(context, request),
    maxOutputTokens: 4000,
    signal,
  });
  const parsed = extractJsonObject(answer.text);
  const plan = parsed !== null && typeof parsed === "object" ? (parsed as { plan?: unknown }).plan : undefined;
  if (!Array.isArray(plan)) throw new AiError("AI'en returnerede ikke en gyldig plan. Prøv igen.");
  const validated = validateProposal(plan, context);
  if (validated.plan.length === 0) {
    throw new AiError("AI'en foreslog ingen retter, der overholdt jeres regler. Prøv igen.");
  }
  const completed = completePlan(validated, context);
  return { items: completed.plan, rejectedCount: validated.rejectedCount };
}
