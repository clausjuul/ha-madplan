import { describe, expect, it } from "vitest";
import { VOICE_AUTOMATIONS } from "../src/ha/voice.ts";
import {
  addSpokenItems,
  handleVoiceEvent,
  removeSpokenItems,
  splitSpokenItems,
  startVoiceShopping,
} from "../src/ha/voice-shopping.ts";
import type { SocketLike } from "../src/ha/voice-shopping.ts";
import { currentShoppingList } from "../src/state.ts";
import { setup } from "./helpers.ts";

const labels = (s: ReturnType<typeof setup>) =>
  currentShoppingList(s.deps).items.filter((item) => !item.checked).map((item) => item.label);

describe("spoken shopping items", () => {
  it("splits a spoken list and drops filler words and duplicates", () => {
    expect(splitSpokenItems("en liter mælk, æg og smør.")).toEqual(["liter mælk", "æg", "smør"]);
    expect(splitSpokenItems("Mælk og mælk")).toEqual(["Mælk"]);
    expect(splitSpokenItems("  ")).toEqual([]);
  });

  it("adds items once and says what happened", () => {
    const s = setup();
    expect(addSpokenItems(s.deps, "mælk og æg")).toBe("Jeg har sat mælk og æg på indkøbslisten.");
    expect(addSpokenItems(s.deps, "Mælk, kaffe")).toBe("Jeg har sat kaffe på indkøbslisten. Mælk står der allerede.");
    expect(labels(s)).toEqual(expect.arrayContaining(["mælk", "æg", "kaffe"]));
    expect(labels(s)).toHaveLength(3);
  });

  it("removes own extras and reports items that were not there", () => {
    const s = setup();
    addSpokenItems(s.deps, "mælk, æg");
    expect(removeSpokenItems(s.deps, "mælk og bananer")).toBe("Jeg har fjernet mælk fra indkøbslisten. Bananer stod ikke på listen.");
    expect(labels(s)).toEqual(["æg"]);
  });

  it("answers unknown or empty requests without changing anything", () => {
    const s = setup();
    expect(handleVoiceEvent(s.deps, { handling: "tilfoj", tekst: "", id: "1" })).toEqual({
      id: "1",
      svar: "Jeg hørte ikke, hvad der skulle på indkøbslisten.",
    });
    expect(handleVoiceEvent(s.deps, null).svar).toBe("Det kan Madplan ikke endnu.");
    expect(labels(s)).toEqual([]);
  });
});

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("voice listener", () => {
  it("authenticates, subscribes and replies to events with the spoken answer", () => {
    const s = setup({ config: { supervisorToken: "tok", voiceCommands: true } });
    const sockets: FakeSocket[] = [];
    let ups = 0;
    const listener = startVoiceShopping(s.deps, {
      connect: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onHomeAssistantUp: () => ups++,
    });
    const socket = sockets[0]!;
    socket.receive({ type: "auth_required" });
    expect(socket.sent[0]).toEqual({ type: "auth", access_token: "tok" });
    socket.receive({ type: "auth_ok" });
    expect(socket.sent[1]).toMatchObject({ type: "subscribe_events", event_type: "madplan_stemme" });
    expect(socket.sent[2]).toMatchObject({ type: "subscribe_events", event_type: "homeassistant_started" });
    expect(ups).toBe(1);
    socket.receive({ type: "event", event: { event_type: "homeassistant_started", data: {} } });
    expect(ups).toBe(2);
    socket.receive({ type: "event", event: { event_type: "madplan_stemme", data: { handling: "tilfoj", tekst: "rugbrød", id: "42" } } });
    expect(socket.sent[3]).toMatchObject({
      type: "fire_event",
      event_type: "madplan_stemme_svar",
      event_data: { id: "42", svar: "Jeg har sat rugbrød på indkøbslisten." },
    });
    expect(labels(s)).toEqual(["rugbrød"]);
    listener.stop();
    expect(socket.closed).toBe(true);
  });

  it("does nothing without a token, and only watches for restarts when voice commands are off", () => {
    const sockets: FakeSocket[] = [];
    const connect = () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    };
    startVoiceShopping(setup({ config: { supervisorToken: "", voiceCommands: true } }).deps, { connect }).stop();
    expect(sockets).toHaveLength(0);
    const s = setup({ config: { supervisorToken: "tok", voiceCommands: false } });
    const listener = startVoiceShopping(s.deps, { connect });
    const socket = sockets[0]!;
    socket.receive({ type: "auth_required" });
    socket.receive({ type: "auth_ok" });
    expect(socket.sent.slice(1)).toEqual([expect.objectContaining({ event_type: "homeassistant_started" })]);
    socket.receive({ type: "event", event: { event_type: "madplan_stemme", data: { handling: "tilfoj", tekst: "rugbrød", id: "1" } } });
    expect(socket.sent).toHaveLength(2);
    expect(labels(s)).toEqual([]);
    listener.stop();
  });

  it("the automations send the spoken wildcard and speak the app's reply", () => {
    const add = VOICE_AUTOMATIONS.find((automation) => automation.id === "madplan_stemme_tilfoj")!;
    expect(add.trigger[0]?.command.some((sentence) => sentence.includes("{vare}"))).toBe(true);
    expect(JSON.stringify(add.action)).toContain("trigger.slots.vare");
    expect(JSON.stringify(add.action)).toContain("madplan_stemme_svar");
    expect(VOICE_AUTOMATIONS.some((automation) => automation.id === "madplan_stemme_fjern")).toBe(true);
  });
});
