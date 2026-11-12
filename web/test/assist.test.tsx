import { MemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssistProposal } from "@madplan/domain";
import { createFakeClient } from "../src/api/fake-client";
import { ProposalCard } from "../src/components/assist/ProposalCard";
import {
  chipsFor,
  contextFor,
  engineTitle,
  loadSession,
  previewLines,
  proposalStatusLine,
  saveSession,
  speechRecognitionCtor,
  startedPlanDraft,
  toApiMessages,
  type ChatEntry,
} from "../src/lib/assist-model";

const proposal: AssistProposal = {
  id: "p1",
  summary: "Test",
  expiresAt: "2026-11-09T18:00:00.000Z",
  actions: [
    { type: "setMeal", date: "2026-11-12", dishId: "tacos", label: "Sæt «Tacos» på torsdag den 12. november" },
    { type: "addShoppingExtra", item: "Mælk", label: "Tilføj «Mælk» til indkøbslisten" },
    { type: "startPlanDraft", label: "Lav et planudkast", request: {
      engine: "local", from: "2026-11-09", dayCount: 3, skippedDates: [], newDishCount: 0, requiredDishIds: [], request: "", dayRequests: {},
    } },
  ],
};

const entry = (extra: Partial<ChatEntry> = {}): ChatEntry => ({
  id: "e1", role: "assistant", content: "Her er et forslag.", proposal, proposalState: "pending", ...extra,
});

describe("prompt chips and context", () => {
  it("picks quick prompts per view", () => {
    expect(chipsFor(contextFor({ name: "uge" }))).toContain("Byt torsdag ud med noget vegetarisk");
    expect(chipsFor(contextFor({ name: "indkob" }))).toContain("Tilføj det vi mangler til tacos");
    expect(chipsFor(contextFor({ name: "retter", dishId: "lasagne" }))).toContain("Kan den laves uden mælk?");
    expect(chipsFor(contextFor({ name: "lav-mad", dishId: "lasagne" }))).toContain("Kan den laves uden mælk?");
    expect(chipsFor({ view: "ukendt" }).length).toBeGreaterThan(0);
  });

  it("describes the view and focused dish", () => {
    expect(contextFor({ name: "retter", dishId: "x" })).toEqual({ view: "opskrift", dishId: "x" });
    expect(contextFor({ name: "retter" })).toEqual({ view: "retter" });
    expect(contextFor({ name: "indkob" })).toEqual({ view: "indkob" });
  });
});

describe("speech support", () => {
  it("detects the standard and webkit constructors and hides the mic otherwise", () => {
    class Fake {}
    expect(speechRecognitionCtor({ SpeechRecognition: Fake })).toBe(Fake);
    expect(speechRecognitionCtor({ webkitSpeechRecognition: Fake })).toBe(Fake);
    expect(speechRecognitionCtor({})).toBeNull();
    expect(speechRecognitionCtor(undefined)).toBeNull();
  });
});

describe("proposal preview", () => {
  it("lists every action with its kind and outcome", () => {
    const lines = previewLines(proposal, [{ label: "a", ok: true }, { label: "b", ok: false, message: "Låst" }]);
    expect(lines.map((line) => line.kind)).toEqual(["meal", "shopping", "plan"]);
    expect(lines[1]?.result).toMatchObject({ ok: false, message: "Låst" });
    expect(lines[2]?.result).toBeUndefined();
  });

  it("offers the draft only when it was started", () => {
    expect(startedPlanDraft(proposal, [{ label: "", ok: true }, { label: "", ok: true }, { label: "", ok: true }])).toBe(true);
    expect(startedPlanDraft(proposal, [{ label: "", ok: true }, { label: "", ok: true }, { label: "", ok: false }])).toBe(false);
    expect(startedPlanDraft(proposal)).toBe(false);
  });

  it("renders labels, and Udfør / Afvis call back", () => {
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    render(<ProposalCard entry={entry()} onApply={onApply} onDismiss={onDismiss} />, { wrapper: MemoryRouter });
    expect(screen.getByText("Tilføj «Mælk» til indkøbslisten")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Udfør" }));
    fireEvent.click(screen.getByRole("button", { name: "Afvis" }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows results and the draft link after apply", () => {
    const results = [{ label: "", ok: true }, { label: "", ok: false, message: "Måltidet er låst." }, { label: "", ok: true }];
    render(<ProposalCard entry={entry({ proposalState: "applied", results })} onApply={vi.fn()} onDismiss={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole("button", { name: "Udfør" })).toBeNull();
    expect(screen.getByText("Måltidet er låst.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Åbn kladden" }).getAttribute("href")).toBe("/planlaeg");
  });
});

describe("header and session", () => {
  it("labels the engine honestly", () => {
    expect(engineTitle("openai", false).title).toBe("Assist · OpenAI");
    expect(engineTitle("homeassistant", false)).toEqual({ title: "Assist · Home Assistant", subtitle: "Kan kun svare, ikke ændre" });
    expect(engineTitle("openai", true).title).toBe("Assist · Demo");
  });

  it("sends only real messages and survives broken or blocked storage", () => {
    const messages = toApiMessages([
      { id: "1", role: "user", content: "Hej" },
      { id: "2", role: "assistant", content: "Fejl", error: true },
      { id: "3", role: "assistant", content: "Svar", proposal },
    ]);
    expect(messages[0]).toEqual({ role: "user", content: "Hej" });
    expect(messages[1]?.content).toMatch(/^Svar\n\n\[Forslag \(afventer\): Sæt «Tacos»/u);
    expect(messages).toHaveLength(2);

    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    saveSession(storage, { entries: [entry()], conversationId: "c" });
    expect(loadSession(storage).conversationId).toBe("c");
    saveSession(storage, { entries: [] });
    expect(loadSession(storage).entries).toEqual([]);
    store.set("madplan.assist.v1", "{kaput");
    expect(loadSession(storage).entries).toEqual([]);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(loadSession(blocked).entries).toEqual([]);
    expect(() => saveSession(blocked, { entries: [entry()] })).not.toThrow();
  });
});

describe("assistant memory, choice and situation", () => {
  it("tells the assistant what became of each proposal", () => {
    const results = [{ label: "", ok: true }, { label: "", ok: false, message: "Låst" }, { label: "", ok: false, message: "Fravalgt." }];
    expect(proposalStatusLine(entry({ proposalState: "applied", results }))).toMatch(
      /^\[Forslag \(udført\): Sæt «Tacos».*; Tilføj «Mælk» til indkøbslisten \(ikke udført: Låst\); Lav et planudkast \(ikke udført: Fravalgt\.\)\]$/u,
    );
    expect(proposalStatusLine(entry({ proposalState: "dismissed" }))).toMatch(/^\[Forslag \(afvist\)/u);
    expect(proposalStatusLine(entry({ proposalState: "applied", results, undone: true }))).toMatch(/^\[Forslag \(afvist\).*\(fortrudt\)/u);
    expect(proposalStatusLine({ id: "x", role: "assistant", content: "Hej" })).toBeNull();
    expect(toApiMessages([{ id: "s", role: "assistant", content: "Skriver", streaming: true }])).toEqual([]);
  });

  it("suggests prompts that fit the situation", () => {
    const chips = chipsFor({ view: "uge" }, {
      today: "2026-11-09",
      meals: { "2026-11-08": { dishId: "tacos", locked: false, note: "", source: "manual" } },
      fridge: [{ name: "Fløde", expiresOn: "2026-11-10" }],
      dishes: [{ id: "tacos", name: "Tacos", ingredients: [], prepMinutes: 20, category: "Mexicansk", favorite: false, leftoverFriendly: false, freezerFriendly: false }],
    });
    expect(chips).toEqual(expect.arrayContaining(["Foreslå en ret til i morgen", "Vi elskede tacos i går"]));
    expect(chips.some((chip) => chip.includes("fløde"))).toBe(true);
    expect(chips.length).toBeLessThanOrEqual(4);
  });

  it("lets the user untick actions and undo afterwards", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ProposalCard entry={entry({ unselected: [1] })} onApply={vi.fn()} onDismiss={vi.fn()} onToggle={onToggle} />,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole("button", { name: "Udfør 2 af 3" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onToggle).toHaveBeenCalledWith(0);
    const onUndo = vi.fn();
    rerender(
      <ProposalCard
        entry={entry({ proposalState: "applied", results: [{ label: "", ok: true }, { label: "", ok: true }, { label: "", ok: true }], undoId: "u1" })}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
        onUndo={onUndo}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fortryd" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});

describe("demo assistant", () => {
  it("is clearly marked, proposes for recognisable prompts, and applies on request", async () => {
    const client = createFakeClient({ today: "2026-11-09", openai: true });
    const ask = (text: string) => client.assist({ messages: [{ role: "user", content: text }], context: { view: "uge" } });

    const veg = await ask("Byt torsdag ud med noget vegetarisk");
    expect(veg.reply.startsWith("Demo:")).toBe(true);
    expect(veg.proposal?.actions[0]).toMatchObject({ type: "setMeal", date: "2026-11-12" });
    const applied = await client.applyAssistProposal(veg.proposal?.id ?? "");
    expect(applied.applied).toBe(1);
    expect((await client.bootstrap()).meals["2026-11-12"]?.dishId).not.toBe("tomatsuppe");
    await expect(client.applyAssistProposal(veg.proposal?.id ?? "")).rejects.toMatchObject({ status: 404 });

    const tacos = await ask("Tilføj det vi mangler til tacos");
    expect(tacos.proposal?.actions).toHaveLength(3);
    const dismissed = await client.discardAssistProposal(tacos.proposal?.id ?? "");
    expect(dismissed).toBeUndefined();

    expect((await ask("hvad som helst")).proposal).toBeUndefined();
  });
});
