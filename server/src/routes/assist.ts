import type { Hono } from "hono";
import { stream } from "hono/streaming";
import type { AssistRequest, AssistStreamEvent } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { badRequest, HttpError } from "../errors.ts";
import { readJson } from "../http.ts";
import { applyProposal, assist, createProposalStore, discardProposal, undoProposal } from "../services/assist.ts";
import { dateParam } from "../validate.ts";
import { isRec, list, num, oneOf, optStr, rec, str } from "../validate-basic.ts";

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

  /** Same answer as POST /assist, as NDJSON: reply deltas while the model writes, then "done" (or "error"). */
  api.post("/assist/stream", async (c) => {
    const request = assistRequest(await readJson(c));
    c.header("content-type", "application/x-ndjson; charset=utf-8");
    c.header("cache-control", "no-cache, no-transform");
    c.header("x-accel-buffering", "no");
    return stream(c, async (out) => {
      const send = (event: AssistStreamEvent): Promise<unknown> => out.write(`${JSON.stringify(event)}\n`);
      let shown = 0;
      try {
        const response = await assist(deps, store, request, (reply) => {
          const delta = reply.slice(shown);
          shown = reply.length;
          if (delta) void send({ type: "delta", text: delta });
        });
        await send({ type: "done", response });
      } catch (error) {
        if (!(error instanceof HttpError)) console.error("Assist-stream fejlede", error);
        await send(
          error instanceof HttpError
            ? { type: "error", status: error.status, message: error.message }
            : { type: "error", status: 500, message: "Assist fejlede. Prøv igen." },
        );
      }
    });
  });

  api.post("/assist/proposals/:id/apply", async (c) => {
    const body: unknown = c.req.header("content-length") === "0" ? {} : await readJson(c).catch(() => ({}));
    const only = isRec(body) && body.only !== undefined
      ? list(body.only, "Valgte handlinger", (entry) => num(entry, "Handling", { min: 0, max: 50, int: true }), 50)
      : undefined;
    return c.json(applyProposal(deps, store, c.req.param("id"), only));
  });

  api.post("/assist/undo/:id", (c) => {
    undoProposal(deps, c.req.param("id"));
    return c.json({ undone: true });
  });

  api.delete("/assist/proposals/:id", (c) => {
    discardProposal(deps, store, c.req.param("id"));
    return c.body(null, 204);
  });
}
