import {
  addDaysToKey,
  dateKey,
  formatFullDate,
  parseDateKey,
  startOfWeek,
  type AssistAction,
  type AssistActionResult,
  type AssistProposal,
  type ChangeTopic,
  type Dish,
} from "@madplan/domain";
import { ApiRequestError, type ApiClient } from "./client";
import type { FakeState } from "./fake-data";

type AssistMethods = Pick<ApiClient, "assist" | "applyAssistProposal" | "discardAssistProposal">;

type Context = {
  state: FakeState;
  today: string;
  wait: () => Promise<void>;
  emit: (topics: ChangeTopic[]) => void;
  addShoppingExtra: (label: string) => void;
};

const DEMO = "Demo: ";
const MEAT = /kød|kylling|bacon|laks|fisk|pølse|flæsk|rejer|skinke|tun|frikadelle|mørbrad|okse|svine|hakket|ribben|steg|kalv|lam|medister|torsk|sild|and\b|kebab|gyros|shawarma|chorizo|pepperoni|salami|bøf|burger|hotdog|kalkun|rullepølse|leverpostej|chili con carne/iu;

const GONE = (): ApiRequestError =>
  new ApiRequestError(404, "not_found", "Forslaget findes ikke (mere). Bed Assist om det igen.");

/** A canned, clearly marked demo assistant: recognises a few prompts and proposes safe actions. */
export function createFakeAssist(context: Context): AssistMethods {
  const proposals = new Map<string, AssistProposal>();
  let counter = 0;

  const propose = (summary: string, actions: AssistAction[]): AssistProposal => {
    counter += 1;
    const proposal: AssistProposal = {
      id: `demo-${counter}`,
      summary,
      actions,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
    proposals.set(proposal.id, proposal);
    return proposal;
  };

  const thursday = (): string => {
    const monday = dateKey(startOfWeek(parseDateKey(context.today)));
    const date = addDaysToKey(monday, 3);
    return date >= context.today ? date : addDaysToKey(date, 7);
  };

  const vegetarian = (excludeId: string | undefined): Dish | undefined =>
    context.state.dishes.find(
      (dish) => !dish.archivedAt && dish.id !== excludeId && dish.category !== "Takeaway" && !MEAT.test(`${dish.name} ${dish.ingredients.join(" ")}`),
    );

  const execute = (action: AssistAction): AssistActionResult => {
    const { label } = action;
    const { meals } = context.state;
    if (action.type === "setMeal") {
      if (meals[action.date]?.locked) return { label, ok: false, message: "Måltidet er låst. Lås det op, før Assist ændrer det." };
      meals[action.date] = { dishId: action.dishId, locked: false, note: meals[action.date]?.note ?? "", source: "manual" };
      context.emit(["meals", "shopping"]);
      return { label, ok: true };
    }
    if (action.type === "addShoppingExtra") {
      context.addShoppingExtra(action.item);
      return { label, ok: true };
    }
    return { label, ok: false, message: "Det kan demoen ikke udføre." };
  };

  return {
    async assist(request) {
      await context.wait();
      const text = (request.messages.at(-1)?.content ?? "").toLowerCase();
      if (text.includes("torsdag") && text.includes("vegetar")) {
        const date = thursday();
        const dish = vegetarian(context.state.meals[date]?.dishId);
        if (dish) {
          const label = `Sæt «${dish.name}» på ${formatFullDate(date)}`;
          const proposal = propose("Byt torsdag til en vegetarisk ret", [{ type: "setMeal", date, dishId: dish.id, label }]);
          return { reply: `${DEMO}Her er et vegetarisk forslag til torsdag: ${dish.name}.`, engine: "openai", proposal };
        }
      }
      if (text.includes("taco")) {
        const items = ["Tortillas", "Creme fraiche", "Avocado"];
        const proposal = propose(
          "Tilføj det der mangler til tacos",
          items.map((item): AssistAction => ({ type: "addShoppingExtra", item, label: `Tilføj «${item}» til indkøbslisten` })),
        );
        return { reply: `${DEMO}Til tacos mangler I måske ${items.join(", ").toLowerCase()}.`, engine: "openai", proposal };
      }
      if (text.includes("køleskab")) {
        const names = context.state.fridge.map((item) => item.name.toLowerCase()).join(", ") || "ingenting";
        return { reply: `${DEMO}I køleskabet ligger ${names}. En rigtig assistent kunne foreslå retter af det.`, engine: "openai" };
      }
      return {
        reply: `${DEMO}Jeg er en indbygget demo og kender kun få sætninger. Prøv for eksempel «Byt torsdag ud med noget vegetarisk» eller «Tilføj det vi mangler til tacos».`,
        engine: "openai",
      };
    },

    async applyAssistProposal(id) {
      await context.wait();
      const proposal = proposals.get(id);
      if (!proposal) throw GONE();
      proposals.delete(id);
      const results = proposal.actions.map(execute);
      return { applied: results.filter((result) => result.ok).length, results };
    },

    async discardAssistProposal(id) {
      await context.wait();
      if (!proposals.delete(id)) throw GONE();
    },
  };
}
