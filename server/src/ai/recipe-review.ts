/**
 * Recipe check before an imported dish is saved: the AI rewrites each ingredient line into the
 * app's format ("400 g hakket oksekød", notes in one parenthesis, plain shop names, obvious typos
 * fixed). Code then guards it: the same number of lines, and every amount must survive unchanged.
 * A line that fails the guard keeps its original text, so the check can tidy but never invent.
 */
import { cleanIngredientLine, parseIngredient, type RecipeReview } from "@madplan/domain";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence, type Prompt } from "./prompt.ts";
import type { ParsedRecipe } from "./recipe-import.ts";

const MAX_CHANGES = 8;

export function reviewPrompt(recipe: ParsedRecipe, fence = newFence()): Prompt {
  const instructions = [
    "Du tjekker en opskrift, der er hentet fra en dansk opskriftsside, før den gemmes i en madplan-app. Appen laver indkøbslister ud fra ingredienslinjerne.",
    "Omskriv HVER ingredienslinje til formatet: <mængde> <enhed> <vare> (<note>).",
    "- Enheder: g, kg, ml, dl, l, stk., dåse, glas, pakke, flaske, spsk., tsk., bundt, potte, fed. Skriv gram som g (\"400 gr\" → \"400 g\"). Skriv enheden lige efter mængden.",
    "- Mængden skal være PRÆCIS den samme som i originalen (samme tal og samme mængde efter omregning). Opfind aldrig en mængde. En linje uden mængde forbliver uden mængde.",
    "- <vare> er det, man køber i butikken, med små bogstaver og så kort som muligt (\"alm løg\" → \"løg\", \"gr revet ost, fx mozzarella\" → \"revet ost\"). Ret tydelige stavefejl (\"ekstragon\" → \"estragon\").",
    "- Tilberedning og forslag kommer i ÉN parentes til sidst (\"løg (hakket)\", \"revet ost (fx mozzarella)\"). Aldrig dobbelte parenteser.",
    "- Bevar rækkefølgen. Tilføj, fjern, flet eller del aldrig linjer. Antallet af linjer skal være det samme som i originalen.",
    "Angiv portioner (antal personer) kun hvis det tydeligt fremgår af data, ellers null.",
    "I changes: højst 8 korte danske sætninger om det, du rettede (fx \"400 gr er rettet til 400 g\"). Tom liste hvis intet skulle rettes.",
    FENCE_RULE(fence),
  ].join("\n");
  const input = [
    fenced(
      "Opskriften:",
      {
        name: recipe.name,
        servings: recipe.servings ?? null,
        ingredients: recipe.ingredients,
        instructions: (recipe.instructions ?? []).slice(0, 20),
      },
      fence,
    ),
    `Svar med JSON: { "ingredients": [${recipe.ingredients.length} linjer i samme rækkefølge], "servings": tal eller null, "changes": [...] }.`,
  ].join("\n\n");
  return { instructions, input };
}

const reviewSchema = {
  name: "recipe_review",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ingredients", "servings", "changes"],
    properties: {
      ingredients: { type: "array", items: { type: "string" } },
      servings: { type: ["number", "null"] },
      changes: { type: "array", items: { type: "string" } },
    },
  },
};

const sameAmount = (a?: number, b?: number): boolean =>
  a === undefined || b === undefined ? a === b : Math.abs(a - b) <= Math.max(a, b) * 0.001;

/** Keeps the AI's version of a line only when the amount and unit are unchanged (after normalising kg→g, dl→ml…). */
function acceptLine(original: string, proposed: unknown): string {
  if (typeof proposed !== "string") return original;
  const line = cleanIngredientLine(proposed).slice(0, 200);
  if (!line) return original;
  const before = parseIngredient(original);
  const after = parseIngredient(line);
  if (!sameAmount(before.amount, after.amount)) return original;
  if (before.unit !== after.unit) return original;
  return line;
}

export type ReviewOutcome = { recipe: ParsedRecipe; review: RecipeReview };

/** Applies the guarded answer. Exported for tests. */
export function applyReview(recipe: ParsedRecipe, answer: unknown): ReviewOutcome {
  const unchanged: ReviewOutcome = { recipe, review: { checked: true, changes: [] } };
  if (answer === null || typeof answer !== "object") return { recipe, review: { checked: false, changes: [] } };
  const body = answer as { ingredients?: unknown; servings?: unknown; changes?: unknown };
  if (!Array.isArray(body.ingredients) || body.ingredients.length !== recipe.ingredients.length) {
    return { recipe, review: { checked: false, changes: [] } };
  }
  const proposed: readonly unknown[] = body.ingredients;
  const ingredients = recipe.ingredients.map((original, index) => acceptLine(original, proposed[index]));
  const changedLines = ingredients.filter((line, index) => line !== recipe.ingredients[index]).length;
  const servings =
    recipe.servings ??
    (typeof body.servings === "number" && Number.isFinite(body.servings) && body.servings >= 1 && body.servings <= 30
      ? body.servings
      : undefined);
  if (changedLines === 0 && servings === recipe.servings) return unchanged;
  const notes = Array.isArray(body.changes)
    ? body.changes.filter((note): note is string => typeof note === "string" && note.trim() !== "").map((note) => note.trim().slice(0, 160))
    : [];
  const changes = notes.length ? notes.slice(0, MAX_CHANGES) : [`${changedLines} ingredienslinjer er rettet til appens format.`];
  const next: ParsedRecipe = { ...recipe, ingredients };
  if (servings !== undefined) next.servings = servings;
  return { recipe: next, review: { checked: true, changes } };
}

/** Never throws: without OpenAI, or when the call fails, the recipe is returned as it was. */
export async function reviewRecipe(
  client: OpenAiClient,
  model: string,
  recipe: ParsedRecipe,
  signal?: AbortSignal,
): Promise<ReviewOutcome> {
  if (!client.configured) return { recipe, review: { checked: false, changes: [] } };
  try {
    const { text } = await client.respond({ model, ...reviewPrompt(recipe), jsonSchema: reviewSchema, maxOutputTokens: 3000, signal });
    return applyReview(recipe, JSON.parse(text) as unknown);
  } catch {
    return { recipe, review: { checked: false, changes: [] } };
  }
}
