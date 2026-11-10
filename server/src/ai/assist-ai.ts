/**
 * Assist prompt + answer parsing. The model may only PROPOSE actions as JSON; the server turns them into
 * typed actions (services/assist-actions.ts) and nothing is written until the user applies the proposal.
 *
 * Prompt safety: everything that is not our own instruction text (chat messages, dish names, fridge
 * contents, profile notes, ...) is untrusted. It is serialised as JSON inside blocks fenced with a random
 * per-request token, length-clipped, and sent in the user `input`; only our rules are in `instructions`.
 */
import { addDaysToKey, weekdayName } from "@madplan/domain";
import type { AssistChatMessage, AssistContext } from "@madplan/domain";
import type { ActionEnv } from "../services/assist-actions.ts";
import type { Snapshot } from "../state.ts";
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import type { Prompt } from "./prompt.ts";

const clip = (value: string, max: number): string => value.slice(0, max);
const HISTORY = 12;
const WINDOW_DAYS = 14;

const RULES = [
  "Du er Assist i Madplan, en dansk familiemadplan. Svar kort, venligt og på dansk.",
  "Du kan IKKE ændre noget selv. Du kan kun FORESLÅ handlinger; brugeren skal selv trykke Udfør.",
  "Brug kun dato- og ret-id'er fra DATA. Foreslå aldrig låste dage (locked: true), og aldrig retter, der strider mod fravalg eller kostønsker.",
  "Foreslå kun handlinger, brugeren har bedt om. Spørgsmål besvares uden handlinger. Opfind aldrig resultater, priser eller tilbud.",
  'Returnér UDELUKKENDE ét JSON-objekt: {"reply":"kort dansk svar","actions":[...]} (actions kan være tom, maks. 8).',
  "Tilladte handlinger (felter præcis som vist):",
  '{"type":"setMeal","date":"YYYY-MM-DD","dishId":"id"}  {"type":"removeMeal","date":"YYYY-MM-DD"}',
  '{"type":"swapMeals","a":"YYYY-MM-DD","b":"YYYY-MM-DD"}  {"type":"lockMeal","date":"YYYY-MM-DD","locked":true}',
  '{"type":"addShoppingExtra","item":"varenavn"}  {"type":"addFridgeItem","name":"vare","quantity":"valgfri","expiresOn":"YYYY-MM-DD valgfri"}',
  '{"type":"removeFridgeItem","name":"vare"}  {"type":"addGlobalExclusion","term":"ingrediens"}',
  '{"type":"createDish","dish":{"name":"","ingredients":["200 g ..."],"prepMinutes":30,"category":"","servings":4,"instructions":["trin"]}}',
  '{"type":"startPlanDraft","request":{"dayCount":7,"from":"YYYY-MM-DD","request":"fritekst-ønske","newDishCount":0}}',
].join("\n");

export function assistPrompt(input: {
  state: Snapshot;
  env: ActionEnv;
  context: AssistContext;
  messages: readonly AssistChatMessage[];
  fence?: string;
}): Prompt {
  const { state, env, context } = input;
  const fence = input.fence ?? newFence();
  const block = (title: string, data: unknown): string => fenced(title, data, fence);

  const dates = Array.from({ length: WINDOW_DAYS }, (_, index) => addDaysToKey(state.today, index));
  const planned = dates.map((date) => {
    const meal = state.meals[date];
    return {
      date,
      weekday: weekdayName(date),
      meal: meal
        ? { dishId: meal.dishId, name: clip(env.dish(meal.dishId)?.name ?? "ukendt", 130), locked: meal.locked, skipped: meal.skipped === true }
        : null,
    };
  });
  const plannedIds = new Set(planned.flatMap((day) => (day.meal ? [day.meal.dishId] : [])));
  const focusId = context.dishId;
  const catalog = state.dishes
    .filter((dish) => !dish.archivedAt)
    .map((dish) => ({
      id: dish.id,
      name: clip(dish.name, 130),
      category: clip(dish.category, 60),
      // Ingredients only where the conversation can need them (planned or focused dishes).
      ...(plannedIds.has(dish.id) || dish.id === focusId ? { ingredients: dish.ingredients.slice(0, 40).map((i) => clip(i, 120)) } : {}),
    }));
  const profiles = state.profiles
    .filter((profile) => profile.active)
    .slice(0, 30)
    .map((profile) => ({
      name: clip(profile.name, 60),
      restrictions: profile.exclusions.slice(0, 20),
      likes: profile.preferences.slice(0, 20),
      dislikes: profile.dislikes.slice(0, 20),
    }));
  const history = input.messages.slice(-HISTORY).map((message) => ({ role: message.role, content: clip(message.content, 2000) }));

  const instructions = [RULES, FENCE_RULE(fence), `I dag er ${state.today} (${weekdayName(state.today)}).`].join("\n\n");
  const dataInput = [
    block("Visning og fokus:", {
      view: clip(context.view, 40),
      date: context.date ?? null,
      dish: focusId ? (env.dish(focusId) ? { id: focusId, name: clip(env.dish(focusId)?.name ?? "", 130) } : null) : null,
    }),
    block(`Planlagte måltider, ${WINDOW_DAYS} dage frem:`, planned),
    block("Retkatalog (kun id'er herfra må bruges):", catalog),
    block("Køleskab:", state.fridge.slice(0, 100).map((item) => ({ name: clip(item.name, 100), quantity: item.quantity ?? null, expiresOn: item.expiresOn ?? null }))),
    block("Fælles fravalg (hårde):", state.settings.globalExclusions.slice(0, 100).map((term) => clip(term, 80))),
    block("Familieprofiler:", profiles),
    block("Samtalen (nyeste sidst):", history),
  ].join("\n\n");
  return { instructions, input: dataInput };
}

export type AssistModelAnswer = { reply: string; rawActions: unknown[] };

/** Throws AiError (Danish) when the model gives nothing usable. */
export async function askAssistModel(
  client: OpenAiClient,
  model: string,
  prompt: Prompt,
  signal?: AbortSignal,
): Promise<AssistModelAnswer> {
  const answer = await client.respond({ model, ...prompt, maxOutputTokens: 2500, json: true, signal });
  const parsed = extractJsonObject(answer.text);
  const record = parsed !== null && typeof parsed === "object" ? (parsed as { reply?: unknown; actions?: unknown }) : undefined;
  const reply = typeof record?.reply === "string" ? record.reply.trim() : "";
  if (!reply) throw new AiError("Assist gav ikke noget brugbart svar. Prøv at skrive det på en anden måde.");
  return { reply: clip(reply, 3000), rawActions: Array.isArray(record?.actions) ? record.actions : [] };
}
