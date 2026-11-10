import type { Config } from "../config.ts";
import { HttpError } from "../errors.ts";

/**
 * The Home Assistant conversation API is reachable through the Supervisor proxy whenever the add-on
 * has a Supervisor token (same detection as the v1 server).
 */
export function haAgentAvailable(config: Pick<Config, "supervisorToken">): boolean {
  return config.supervisorToken.length > 0;
}

export type HaAnswer = { text: string; conversationId?: string };

type ConversationResponse = {
  conversation_id?: unknown;
  response?: { speech?: { plain?: { speech?: unknown } } };
};

/** Text-only answer from the configured Home Assistant conversation agent. Never invents an answer. */
export async function askHomeAssistantAgent(
  config: Pick<Config, "supervisorToken">,
  fetcher: typeof fetch,
  text: string,
  conversationId?: string,
  signal?: AbortSignal,
): Promise<HaAnswer> {
  let response: Response;
  try {
    response = await fetcher("http://supervisor/core/api/conversation/process", {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${config.supervisorToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        text: text.trim().slice(0, 1500),
        language: "da",
        ...(conversationId ? { conversation_id: conversationId.slice(0, 256) } : {}),
      }),
    });
  } catch {
    throw new HttpError(502, "ha_unreachable", "Kunne ikke kontakte Home Assistant-assistenten.");
  }
  if (!response.ok) {
    throw new HttpError(502, "ha_rejected", `Home Assistant afviste forespørgslen (HTTP ${response.status}). Tjek samtaleagenten og appens adgang.`);
  }
  const data = (await response.json().catch(() => ({}))) as ConversationResponse;
  const speech = data.response?.speech?.plain?.speech;
  if (typeof speech !== "string" || !speech.trim()) {
    throw new HttpError(502, "ha_empty", "Home Assistant-assistenten returnerede ikke et tekstsvar.");
  }
  return {
    text: speech.trim().slice(0, 6000),
    ...(typeof data.conversation_id === "string" ? { conversationId: data.conversation_id.slice(0, 256) } : {}),
  };
}
