import { describe, expect, it, vi } from "vitest";
import { setupVoice, syncVoiceAutomation, VOICE_AUTOMATIONS } from "../src/ha/voice.ts";

type Stored = Record<string, { description?: string }>;

/** Fake of Home Assistant's /api/config/automation/config/<id> endpoint. */
function fakeHa(stored: Stored = {}) {
  const calls: { method: string; id: string; body?: unknown }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const id = url.split("/").pop() ?? "";
    const method = init?.method ?? "GET";
    calls.push({ method, id, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (method === "GET") return stored[id] ? new Response(JSON.stringify(stored[id])) : new Response("{}", { status: 404 });
    if (method === "POST") stored[id] = JSON.parse(String(init?.body)) as { description?: string };
    if (method === "DELETE") delete stored[id];
    return new Response(JSON.stringify({ result: "ok" }));
  }) as unknown as typeof fetch;
  return { impl, calls, stored };
}

const first = VOICE_AUTOMATIONS[0]!;

describe("voice automations", () => {
  it("creates them with a sentence trigger and a spoken answer from the sensors", async () => {
    const ha = fakeHa();
    expect(await syncVoiceAutomation("tok", ha.impl, first, true)).toBe("created");
    const body = ha.calls.find((call) => call.method === "POST")?.body as typeof first;
    expect(body.trigger[0]).toMatchObject({ platform: "conversation" });
    expect(body.trigger[0]?.command.some((sentence) => sentence.includes("i aften"))).toBe(true);
    expect(body.action[0]?.set_conversation_response).toContain("sensor.madplan_i_aften");
    expect(await syncVoiceAutomation("tok", ha.impl, first, true)).toBe("unchanged");
  });

  it("updates an older version of ours but never touches a user-owned one", async () => {
    const ha = fakeHa({ [first.id]: { description: "Oprettet af Madplan (stemme v0)" } });
    expect(await syncVoiceAutomation("tok", ha.impl, first, true)).toBe("updated");
    const own = fakeHa({ [first.id]: { description: "Min egen" } });
    expect(await syncVoiceAutomation("tok", own.impl, first, true)).toBe("kept");
    expect(await syncVoiceAutomation("tok", own.impl, first, false)).toBe("kept");
    expect(own.stored[first.id]?.description).toBe("Min egen");
  });

  it("removes ours when the option is switched off", async () => {
    const ha = fakeHa();
    await syncVoiceAutomation("tok", ha.impl, first, true);
    expect(await syncVoiceAutomation("tok", ha.impl, first, false)).toBe("removed");
    expect(ha.stored[first.id]).toBeUndefined();
    expect(await syncVoiceAutomation("tok", ha.impl, first, false)).toBe("absent");
  });

  it("is best-effort: failures are logged, never thrown, and nothing happens without a token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = (() => Promise.resolve(new Response("{}", { status: 500 }))) as unknown as typeof fetch;
    await expect(setupVoice({ supervisorToken: "tok", voiceCommands: true }, failing)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(VOICE_AUTOMATIONS.length);
    warn.mockRestore();
    const ha = fakeHa();
    await setupVoice({ supervisorToken: "", voiceCommands: true }, ha.impl);
    expect(ha.calls).toHaveLength(0);
  });
});
