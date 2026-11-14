/**
 * Assist prompt + answer parsing. The model may only PROPOSE actions as JSON; the server turns them into
 * typed actions (services/assist-actions.ts) and nothing is written until the user applies the proposal.
 *
 * Prompt safety: everything that is not our own instruction text (chat messages, dish names, fridge
 * contents, profile notes, ...) is untrusted. It is serialised as JSON inside blocks fenced with a random
 * per-request token, length-clipped, and sent in the user `input`; only our rules are in `instructions`.
 */
import {
  addDaysToKey,
  daysBetween,
  dishOfferMatches,
  eatenHistory,
  lastEatenByDish,
  offerPriceLabel,
  offerSavingKr,
  STORE_NAMES,
  weekdayName,
} from "@madplan/domain";
import type { AssistChatMessage, AssistContext, MealRating, RetailOffer, ShoppingList } from "@madplan/domain";
import type { ActionEnv } from "../services/assist-actions.ts";
import type { Snapshot } from "../state.ts";
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import type { Prompt } from "./prompt.ts";

const clip = (value: string, max: number): string => value.slice(0, max);
const HISTORY = 12;
const WINDOW_DAYS = 14;
const PAST_DAYS = 28;
/** Dates the schema accepts: recent past (ratings, "ikke spist") through four weeks ahead. */
const SCHEMA_PAST = 14;
const SCHEMA_AHEAD = 28;

const RULES = [
  "Du er Assist i Madplan, en dansk familiemadplan. Svar kort, venligt og på dansk.",
  "Du kan IKKE ændre noget selv. Du kan kun FORESLÅ handlinger; brugeren skal selv trykke Udfør (og kan vælge enkelte fra).",
  "Brug kun dato-, ret- og person-id'er fra DATA. Foreslå aldrig ændringer af låste dage (locked: true), og aldrig retter, der strider mod fravalg eller kostønsker.",
  "Foreslå kun handlinger, brugeren har bedt om. Spørgsmål besvares uden handlinger. Opfind aldrig resultater, priser eller tilbud.",
  "Tilbud: kun dem i DATA-blokken \"Tilbud\" (bekræftede tilbud fra jeres butikker via Prej) findes. Er blokken tom, så sig, at der ikke er hentet tilbud. Nævn butik, pris og slutdato, når du bruger et tilbud.",
  "Dit svar må ikke påstå, at noget ER gjort. Skriv i stedet, hvad du foreslår (\"Jeg foreslår ...\").",
  "Tidligere svar fra dig kan slutte med en linje som [Forslag (udført): ...], [Forslag (afvist): ...], [Forslag (afventer): ...] eller [Forslag (udløbet): ...]. Den fortæller, hvad du foreslog, og hvad brugeren gjorde. Foreslå ikke det samme igen, hvis det er udført; brug det, når brugeren henviser til \"det\", \"den anden\" osv. Skriv aldrig selv sådan en linje.",
  "Brug historikken (sidste uger, bedømmelser, dage siden sidst) til spørgsmål om, hvad I har spist, hvad der faldt i god jord, og hvad I ikke har haft længe. Retter med rating never må aldrig foreslås.",
  "Brug ingredienser og køleskabet, når brugeren spørger, hvad man kan lave af noget; varer der snart udløber, er vigtigst.",
  'Svar med ét JSON-objekt: {"reply":"kort dansk svar","actions":[...]} (actions kan være tom, maks. 8). Felter, der ikke bruges, sættes til null.',
  "Handlinger:",
  "setMeal(date, dishId) sæt en ret på en dag · removeMeal(date) · swapMeals(a, b) byt to dage · lockMeal(date, locked)",
  "setMealNote(date, note) note på dagen (tom note fjerner den) · skipMeal(date, skipped) marker en dag som \"ikke spist\" (eller fortryd)",
  "rateMeal(date, rating: up|down|never|null) gem familiens dom over en ret, de HAR spist (i dag eller tidligere). Når brugeren siger, at de elskede/ikke kunne lide aftensmaden, så brug den.",
  "addShoppingExtra(item) · removeShoppingExtra(item) kun ekstra varer, ikke varer der kommer fra retterne",
  "addFridgeItem(name, quantity?, expiresOn?) · removeFridgeItem(name) · addGlobalExclusion(term) kun for hele familien",
  "updateProfile(profileId, field: preferences|dislikes|exclusions|safeFoods, term, remove) når én person kan lide, ikke kan lide, ikke må få noget eller altid spiser noget (dislikes er bløde, exclusions er hårde, safeFoods = alwaysEats).",
  "setMealVariant(date, profileId, replaces, with, remove) én person får én del af dagens ret byttet, fx nuggets i stedet for bøf; resten af retten er den samme. replaces er en af rettens ingredients, with er det, personen skal have i stedet (helst fra alwaysEats). remove=true fjerner byttet.",
  "createDish(dish) ny ret i kataloget · startPlanDraft(request) planudkast for flere dage (dayCount 1-14, from, request = fritekst-ønske, newDishCount).",
].join("\n");

export type AssistPromptInput = {
  state: Snapshot;
  env: ActionEnv;
  context: AssistContext;
  messages: readonly AssistChatMessage[];
  shopping?: ShoppingList;
  fence?: string;
};

type RatingCount = Partial<Record<MealRating, number>>;

function ratingsByDish(state: Snapshot): Map<string, RatingCount> {
  const counts = new Map<string, RatingCount>();
  for (const meal of Object.values(state.meals)) {
    if (!meal.rating) continue;
    const entry = counts.get(meal.dishId) ?? {};
    entry[meal.rating] = (entry[meal.rating] ?? 0) + 1;
    counts.set(meal.dishId, entry);
  }
  return counts;
}

/** A short, quantity-free ingredient hint ("400 g hakket oksekød" -> "hakket oksekød"). */
const ingredientHint = (line: string): string =>
  clip(line.replace(/^[\d.,/½¼¾\s-]*(g|kg|dl|l|ml|cl|stk\.?|spsk\.?|tsk\.?|knsp\.?|dåse|dåser|pakke|pakker|bundt|fed)?\s+/iu, "").trim(), 40);

/** Offers that fit dishes in the catalog, one line per offer with the dishes it fits (small and relevant). */
function offerData(state: Snapshot) {
  const stores = state.settings.preferredStores;
  const byOffer = new Map<RetailOffer, { ingredient: string; dishes: string[] }>();
  for (const dish of state.dishes) {
    if (dish.archivedAt) continue;
    for (const match of dishOfferMatches(dish, state.offers, stores, state.today)) {
      const entry = byOffer.get(match.offer) ?? { ingredient: match.ingredient, dishes: [] };
      if (entry.dishes.length < 3) entry.dishes.push(clip(dish.name, 60));
      byOffer.set(match.offer, entry);
    }
  }
  return [...byOffer]
    .sort(([a], [b]) => offerSavingKr(b) - offerSavingKr(a))
    .slice(0, 60)
    .map(([offer, entry]) => ({
      store: STORE_NAMES[offer.chain],
      item: clip(offer.quantityLabel ? `${offer.name} (${offer.quantityLabel})` : offer.name, 120),
      price: offerPriceLabel(offer),
      savedKr: Math.round(offerSavingKr(offer)),
      ends: offer.validUntil,
      forIngredient: clip(entry.ingredient, 60),
      dishes: entry.dishes,
    }));
}

export function assistPrompt(input: AssistPromptInput): Prompt {
  const { state, env, context, shopping } = input;
  const fence = input.fence ?? newFence();
  const block = (title: string, data: unknown): string => fenced(title, data, fence);
  const dishName = (id: string): string => clip(env.dish(id)?.name ?? "ukendt", 130);

  const dates = Array.from({ length: WINDOW_DAYS }, (_, index) => addDaysToKey(state.today, index));
  const planned = dates.map((date) => {
    const meal = state.meals[date];
    return {
      date,
      weekday: weekdayName(date),
      meal: meal
        ? {
            dishId: meal.dishId,
            name: dishName(meal.dishId),
            locked: meal.locked,
            skipped: meal.skipped === true,
            ...(meal.note ? { note: clip(meal.note, 200) } : {}),
            ...(meal.rating ? { rating: meal.rating } : {}),
            ...(meal.variants?.length ? { variants: meal.variants } : {}),
            ingredients: (state.dishes.find((dish) => dish.id === meal.dishId)?.ingredients ?? []).slice(0, 30),
          }
        : null,
    };
  });
  const past = Array.from({ length: PAST_DAYS }, (_, index) => addDaysToKey(state.today, -PAST_DAYS + index)).flatMap((date) => {
    const meal = state.meals[date];
    if (!meal) return [];
    return [{
      date,
      weekday: weekdayName(date),
      dishId: meal.dishId,
      name: dishName(meal.dishId),
      ...(meal.skipped ? { skipped: true } : {}),
      ...(meal.rating ? { rating: meal.rating } : {}),
      ...(meal.note ? { note: clip(meal.note, 200) } : {}),
    }];
  });

  const plannedIds = new Set(planned.flatMap((day) => (day.meal ? [day.meal.dishId] : [])));
  const focusId = context.dishId;
  const last = lastEatenByDish(eatenHistory(state.meals, state.today));
  const ratings = ratingsByDish(state);
  const catalog = state.dishes
    .filter((dish) => !dish.archivedAt)
    .map((dish) => {
      const lastDate = last.get(dish.id);
      const rating = ratings.get(dish.id);
      const full = plannedIds.has(dish.id) || dish.id === focusId;
      return {
        id: dish.id,
        name: clip(dish.name, 130),
        category: clip(dish.category, 60),
        prepMinutes: dish.prepMinutes,
        ...(dish.favorite ? { favorite: true } : {}),
        daysSinceEaten: lastDate ? daysBetween(lastDate, state.today) : null,
        ...(rating ? { ratings: rating } : {}),
        // Full ingredients where the conversation is likely to need them, a short hint for the rest.
        ingredients: full
          ? dish.ingredients.slice(0, 40).map((line) => clip(line, 120))
          : dish.ingredients.slice(0, 6).map(ingredientHint).filter(Boolean),
      };
    });
  const profiles = state.profiles
    .filter((profile) => profile.active)
    .slice(0, 30)
    .map((profile) => ({
      id: profile.id,
      name: clip(profile.name, 60),
      restrictions: profile.exclusions.slice(0, 20),
      likes: profile.preferences.slice(0, 20),
      dislikes: profile.dislikes.slice(0, 20),
      alwaysEats: (profile.safeFoods ?? []).slice(0, 20),
    }));
  const history = input.messages.slice(-HISTORY).map((message) => ({ role: message.role, content: clip(message.content, 2000) }));
  const shoppingData = shopping
    ? {
        from: shopping.from,
        to: shopping.to,
        missing: shopping.items.filter((item) => !item.checked).slice(0, 120).map((item) => ({
          item: clip(item.label, 80),
          ...(item.quantityLabel ? { quantity: clip(item.quantityLabel, 40) } : {}),
          ...(item.priceIsOffer && item.offer ? { offer: clip(`${item.offer.store} ${item.offer.price ?? ""}`.trim(), 60) } : {}),
          ...(item.extra ? { extra: true } : { for: item.dishNames.slice(0, 3).map((name) => clip(name, 60)) }),
        })),
        boughtCount: shopping.checkedCount,
      }
    : { extras: env.extras.slice(0, 60).map((extra) => clip(extra.label, 80)) };

  const instructions = [RULES, FENCE_RULE(fence), `I dag er ${state.today} (${weekdayName(state.today)}).`].join("\n\n");
  const dataInput = [
    block("Visning og fokus:", {
      view: clip(context.view, 40),
      date: context.date ?? null,
      dish: focusId ? (env.dish(focusId) ? { id: focusId, name: dishName(focusId) } : null) : null,
    }),
    block(`Planlagte måltider, ${WINDOW_DAYS} dage frem:`, planned),
    block(`Spist de sidste ${PAST_DAYS} dage (rating: up = godt, down = ikke så godt, never = aldrig igen):`, past),
    block("Retkatalog (kun id'er herfra må bruges; daysSinceEaten null = aldrig spist):", catalog),
    block("Køleskab:", state.fridge.slice(0, 100).map((item) => ({ name: clip(item.name, 100), quantity: item.quantity ?? null, expiresOn: item.expiresOn ?? null }))),
    block("Tilbud i jeres butikker, der passer til retter i kataloget (højst 60):", offerData(state)),
    block("Basisvarer, der altid er hjemme:", state.pantry.slice(0, 100).map((item) => clip(item, 60))),
    block("Indkøbslisten:", shoppingData),
    block("Fælles fravalg (hårde):", state.settings.globalExclusions.slice(0, 100).map((term) => clip(term, 80))),
    block("Familieprofiler:", profiles),
    block("Samtalen (nyeste sidst):", history),
  ].join("\n\n");
  return { instructions, input: dataInput };
}

/** Asks the model to fix the actions the server refused (one retry), with the reasons as data. */
export function correctionPrompt(prompt: Prompt, previous: string, refused: readonly string[], fence = newFence()): Prompt {
  return {
    instructions: `${prompt.instructions}\n\nDit forrige svar havde handlinger, som serveren afviste. Ret dem, eller drop dem og forklar kort i reply hvorfor. Gentag ikke afviste handlinger uændret.\n\n${FENCE_RULE(fence)}`,
    input: [
      prompt.input,
      fenced("Dit forrige svar:", clip(previous, 4000), fence),
      fenced("Afviste handlinger og grunde:", refused.slice(0, 8).map((reason) => clip(reason, 300)), fence),
    ].join("\n\n"),
  };
}

// Structured output ------------------------------------------------------------------------------

const NULLABLE_STRING = { type: ["string", "null"] } as const;
const MAX_ENUM_CHARS = 9000;

const action = (type: string, properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: ["type", ...Object.keys(properties)],
  properties: { type: { type: "string", enum: [type] }, ...properties },
});

/**
 * Strict JSON schema for the answer. Dates, dish ids and person ids are enums of the real values when
 * they fit OpenAI's limits, so the model cannot invent them; the server still validates everything.
 */
export function assistSchema(state: Snapshot): { name: string; schema: Record<string, unknown> } {
  const dates = Array.from({ length: SCHEMA_PAST + SCHEMA_AHEAD + 1 }, (_, index) => addDaysToKey(state.today, index - SCHEMA_PAST));
  const dishIds = state.dishes.filter((dish) => !dish.archivedAt).map((dish) => dish.id);
  const profileIds = state.profiles.filter((profile) => profile.active).map((profile) => profile.id);
  const enumOrString = (values: string[]): Record<string, unknown> =>
    values.length > 0 && values.length <= 400 && values.join("").length <= MAX_ENUM_CHARS ? { type: "string", enum: values } : { type: "string" };
  const date = { $ref: "#/$defs/date" };
  const dish = { $ref: "#/$defs/dishId" };
  const text = { type: "string" };
  return {
    name: "assist_answer",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reply", "actions"],
      $defs: { date: { type: "string", enum: dates }, dishId: enumOrString(dishIds) },
      properties: {
        reply: text,
        actions: {
          type: "array",
          items: {
            anyOf: [
              action("setMeal", { date, dishId: dish }),
              action("removeMeal", { date }),
              action("swapMeals", { a: date, b: date }),
              action("lockMeal", { date, locked: { type: "boolean" } }),
              action("setMealNote", { date, note: text }),
              action("skipMeal", { date, skipped: { type: "boolean" } }),
              action("rateMeal", { date, rating: { type: ["string", "null"], enum: ["up", "down", "never", null] } }),
              action("addShoppingExtra", { item: text }),
              action("removeShoppingExtra", { item: text }),
              action("addFridgeItem", { name: text, quantity: NULLABLE_STRING, expiresOn: NULLABLE_STRING }),
              action("removeFridgeItem", { name: text }),
              action("addGlobalExclusion", { term: text }),
              action("updateProfile", {
                profileId: enumOrString(profileIds),
                field: { type: "string", enum: ["preferences", "dislikes", "exclusions", "safeFoods"] },
                term: text,
                remove: { type: "boolean" },
              }),
              action("setMealVariant", {
                date,
                profileId: enumOrString(profileIds),
                replaces: text,
                with: text,
                remove: { type: "boolean" },
              }),
              action("createDish", {
                dish: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "ingredients", "prepMinutes", "category", "servings", "instructions"],
                  properties: {
                    name: text,
                    ingredients: { type: "array", items: text },
                    prepMinutes: { type: "integer" },
                    category: text,
                    servings: { type: "number" },
                    instructions: { type: "array", items: text },
                  },
                },
              }),
              action("startPlanDraft", {
                request: {
                  type: "object",
                  additionalProperties: false,
                  required: ["dayCount", "from", "request", "newDishCount"],
                  properties: { dayCount: { type: "integer" }, from: date, request: text, newDishCount: { type: "integer" } },
                },
              }),
            ],
          },
        },
      },
    },
  };
}

// Answer ------------------------------------------------------------------------------------------

/**
 * The reply text written so far in a streamed, still incomplete JSON answer ({"reply":"...).
 * Returns "" until the reply has started; stops at an escape that is not complete yet.
 */
export function partialReply(buffer: string): string {
  const start = /"reply"\s*:\s*"/u.exec(buffer);
  if (!start) return "";
  let out = "";
  for (let index = start.index + start[0].length; index < buffer.length; index += 1) {
    const char = buffer[index]!;
    if (char === '"') break;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = buffer[index + 1];
    if (next === undefined) break;
    if (next === "u") {
      const hex = buffer.slice(index + 2, index + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }
    out += { n: "\n", t: "\t", r: "", b: "", f: "" }[next] ?? next;
    index += 1;
  }
  return out;
}

export type AssistModelAnswer = { reply: string; rawActions: unknown[]; raw: string };

/** Throws AiError (Danish) when the model gives nothing usable. `onReply` gets the reply text as it grows. */
export async function askAssistModel(
  client: OpenAiClient,
  model: string,
  prompt: Prompt,
  options: { schema?: { name: string; schema: Record<string, unknown> }; signal?: AbortSignal; onReply?: (text: string) => void } = {},
): Promise<AssistModelAnswer> {
  let buffer = "";
  let shown = "";
  const answer = await client.respond({
    model,
    ...prompt,
    maxOutputTokens: 2500,
    ...(options.schema ? { jsonSchema: options.schema } : { json: true }),
    signal: options.signal,
    ...(options.onReply
      ? {
          onText: (delta: string) => {
            buffer += delta;
            const reply = partialReply(buffer);
            if (reply.length > shown.length) {
              shown = reply;
              options.onReply?.(reply);
            }
          },
        }
      : {}),
  });
  const parsed = extractJsonObject(answer.text);
  const record = parsed !== null && typeof parsed === "object" ? (parsed as { reply?: unknown; actions?: unknown }) : undefined;
  const reply = typeof record?.reply === "string" ? record.reply.trim() : "";
  if (!reply) throw new AiError("Assist gav ikke noget brugbart svar. Prøv at skrive det på en anden måde.");
  return { reply: clip(reply, 3000), rawActions: Array.isArray(record?.actions) ? record.actions : [], raw: answer.text };
}
