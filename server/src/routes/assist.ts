import type { Hono } from "hono";
import type { AssistRequest } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { badRequest } from "../errors.ts";
import { readJson } from "../http.ts";
import { applyProposal, assist, createProposalStore, discardProposal } from "../services/assist.ts";
import { dateParam } from "../validate.ts";
import { list, oneOf, optStr, rec, str } from "../validate-basic.ts";

export function assistRequest(value: unknown): AssistRequest {
  const body = rec(value, "Samtale");
  const messages = list(body.messages, "Beskeder", (entry) => {
    const o = rec(entry, "Besked");
    return {
      role: oneOf(o.role, "Rolle", ["user", "assistant"] as const),
      content: str(o.content, "Besked", { min: 1, max: 4000 }),
    };
  }, 40);
  if (messages.at(-1)?.role !== "user") throw badRequest("Samtalen skal slutte med en besked fra dig.");
  const context = rec(body.context, "Visning");
  const date = optStr(context.date, "Dato", 10);
  const dishId = optStr(context.dishId, "Ret", 200);
  const conversationId = optStr(body.conversationId, "Samtale-id", 256);
  return {
    messages,
    context: {
      view: str(context.view, "Visning", { min: 1, max: 40 }),
      ...(date ? { date: dateParam(date) } : {}),
      ...(dishId ? { dishId } : {}),
    },
    ...(conversationId ? { conversationId } : {}),
  };
}

export function assistRoutes(api: Hono, deps: Deps): void {
  const store = createProposalStore(deps);

  api.post("/assist", async (c) => c.json(await assist(deps, store, assistRequest(await readJson(c)))));

  api.post("/assist/proposals/:id/apply", (c) => c.json(applyProposal(deps, store, c.req.param("id"))));

  api.delete("/assist/proposals/:id", (c) => {
    discardProposal(deps, store, c.req.param("id"));
    return c.body(null, 204);
  });
}
