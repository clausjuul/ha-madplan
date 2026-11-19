/**
 * Lets Home Assistant's Assist change the shopping list ("tilføj mælk og æg til indkøbslisten").
 *
 * The voice automations (see voice.ts) fire a `madplan_stemme` event with what was said. Madplan listens on
 * Home Assistant's websocket through the Supervisor proxy, changes the list and fires `madplan_stemme_svar`
 * with the sentence Assist should say. Nothing has to be configured in YAML and no port is opened.
 */
import { normalizeItem } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { addItems, removeItemsByLabel } from "../services/shopping-edit.ts";

export const VOICE_EVENT = "madplan_stemme";
export const VOICE_REPLY_EVENT = "madplan_stemme_svar";
const WS_URL = "ws://supervisor/core/websocket";
const MAX_ITEMS = 10;

/** "en liter mælk, æg og smør." -> ["liter mælk", "æg", "smør"] (spoken lists, light clean-up only). */
export function splitSpokenItems(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of text.split(/\s*,\s*|\s+og\s+|\s+samt\s+/iu)) {
    const clean = part
      .replace(/[.!?]+$/u, "")
      .replace(/^(?:en|et|noget|nogle|lidt|mere|flere)\s+/iu, "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 100);
    const key = normalizeItem(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(clean);
  }
  return items.slice(0, MAX_ITEMS);
}

/** ["mælk", "æg", "smør"] -> "mælk, æg og smør". */
export function joinDanish(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

const sentence = (text: string): string => text.charAt(0).toLocaleUpperCase("da-DK") + text.slice(1);

/** Adds spoken items as extras; items already on the list are left alone (a ticked one is unticked). */
export function addSpokenItems(deps: Deps, text: string): string {
  const items = splitSpokenItems(text);
  if (items.length === 0) return "Jeg hørte ikke, hvad der skulle på indkøbslisten.";
  const outcomes = addItems(deps, items);
  const added = items.filter((_, index) => outcomes[index] === "added");
  const already = items.filter((_, index) => outcomes[index] === "already");
  const parts: string[] = [];
  if (added.length > 0) parts.push(`Jeg har sat ${joinDanish(added)} på indkøbslisten.`);
  if (already.length > 0) parts.push(`${sentence(joinDanish(already))} står der allerede.`);
  return parts.join(" ");
}

/** Removes spoken items: own extras are deleted, items from the meal plan are ticked off. */
export function removeSpokenItems(deps: Deps, text: string): string {
  const items = splitSpokenItems(text);
  if (items.length === 0) return "Jeg hørte ikke, hvad der skulle fjernes fra indkøbslisten.";
  const outcomes = removeItemsByLabel(deps, items);
  const removed = outcomes.filter((entry) => entry.outcome !== "missing").map((entry) => entry.label);
  const missing = outcomes.filter((entry) => entry.outcome === "missing").map((entry) => entry.label);
  const parts: string[] = [];
  if (removed.length > 0) parts.push(`Jeg har fjernet ${joinDanish(removed)} fra indkøbslisten.`);
  if (missing.length > 0) parts.push(`${sentence(joinDanish(missing))} stod ikke på listen.`);
  return parts.join(" ");
}

/** Handles one `madplan_stemme` event's data and returns what Assist should say. */
export function handleVoiceEvent(deps: Deps, data: unknown): { id: string; svar: string } {
  const record = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const id = typeof record.id === "string" ? record.id.slice(0, 100) : "";
  const text = typeof record.tekst === "string" ? record.tekst.slice(0, 500) : "";
  try {
    if (record.handling === "tilfoj") return { id, svar: addSpokenItems(deps, text) };
    if (record.handling === "fjern") return { id, svar: removeSpokenItems(deps, text) };
    return { id, svar: "Det kan Madplan ikke endnu." };
  } catch (error) {
    console.error("Stemmekommando fejlede", error);
    return { id, svar: "Madplan kunne ikke ændre indkøbslisten." };
  }
}

/** The slice of the browser WebSocket API we use (Node 24 has it built in); tests pass a fake. */
export type SocketLike = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};
export type SocketFactory = (url: string) => SocketLike;

export type VoiceListener = { stop(): void };

/**
 * Keeps a websocket subscription to `madplan_stemme` open, reconnecting with back-off.
 * No-op without a Supervisor token or when voice commands are switched off.
 */
export function startVoiceShopping(
  deps: Deps,
  connect: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike,
  retryMs = { first: 5_000, max: 60_000 },
): VoiceListener {
  const token = deps.config.supervisorToken;
  if (!token || !deps.config.voiceCommands) return { stop: () => undefined };
  let socket: SocketLike | undefined;
  let timer: NodeJS.Timeout | undefined;
  let delay = retryMs.first;
  let stopped = false;
  let nextId = 1;
  let warned = false;

  const open = (): void => {
    let current: SocketLike;
    try {
      current = connect(WS_URL);
    } catch (error) {
      console.warn("Kunne ikke forbinde til Home Assistant for stemmekommandoer", error);
      return retry();
    }
    socket = current;
    current.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (message.type === "auth_required") {
        current.send(JSON.stringify({ type: "auth", access_token: token }));
      } else if (message.type === "auth_ok") {
        current.send(JSON.stringify({ id: nextId++, type: "subscribe_events", event_type: VOICE_EVENT }));
        delay = retryMs.first;
        if (warned) console.log("Stemmekommandoer til indkøbslisten er forbundet igen.");
        warned = false;
      } else if (message.type === "auth_invalid") {
        console.warn("Home Assistant afviste appens adgang til stemmekommandoer.");
        current.close();
      } else if (message.type === "event") {
        const event = message.event as { event_type?: unknown; data?: unknown } | undefined;
        if (event?.event_type !== VOICE_EVENT) return;
        const reply = handleVoiceEvent(deps, event.data);
        current.send(JSON.stringify({ id: nextId++, type: "fire_event", event_type: VOICE_REPLY_EVENT, event_data: reply }));
      }
    };
    current.onerror = () => undefined;
    current.onclose = () => {
      if (socket === current) socket = undefined;
      if (!warned && !stopped) {
        console.warn("Forbindelsen til Home Assistant for stemmekommandoer blev afbrudt; prøver igen.");
        warned = true;
      }
      retry();
    };
  };

  const retry = (): void => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(open, delay);
    timer.unref();
    delay = Math.min(delay * 2, retryMs.max);
  };

  open();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    },
  };
}
