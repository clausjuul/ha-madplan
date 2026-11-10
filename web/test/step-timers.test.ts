import { describe, expect, it } from "vitest";
import { detectTimer, formatClock, formatDuration } from "../src/lib/step-timers";
import { createTimer, pauseTimer, remainingMs, resetTimer, startTimer, tickTimer } from "../src/lib/timer-machine";

describe("detectTimer (Danish step text)", () => {
  it.each([
    ["Lad kødsaucen simre i 15 minutter under låg.", 900, "15 min"],
    ["Bag i ovnen i 35 min. til den er gylden.", 2100, "35 min"],
    ["Bag lasagnen ved 200 °C i 35–40 minutter.", 2100, "35 min"],
    ["Lad den hvile i 10 min", 600, "10 min"],
    ["Kog æggene i 1 time.", 3600, "1 t"],
    ["Lad det trække i 1,5 time.", 5400, "1 t 30 min"],
    ["Steg i 1 time og 20 minutter.", 4800, "1 t 20 min"],
    ["Lad dejen hæve i en halv time.", 1800, "30 min"],
    ["Rør rundt i 30 sekunder.", 30, "30 sek"],
    ["Steg løgene i 5 minutter ved middel varme.", 300, "5 min"],
  ])("%s", (text, seconds, label) => {
    expect(detectTimer(text)).toEqual({ seconds, label });
  });

  it("returns undefined without a duration", () => {
    expect(detectTimer("Tænd ovnen på 200 °C almindelig ovn.")).toBeUndefined();
    expect(detectTimer("Tilsæt 2 spsk. tomatpuré og 3 fed hvidløg.")).toBeUndefined();
    expect(detectTimer("Server med 4 tallerkener, når det er klar om lidt.")).toBeUndefined();
  });

  it("does not read the start of a longer word as a unit", () => {
    expect(detectTimer("Kom 2 minutterne i gryden")).toBeUndefined();
  });

  it("formats durations and clocks", () => {
    expect(formatDuration(45)).toBe("45 sek");
    expect(formatDuration(5400)).toBe("1 t 30 min");
    expect(formatClock(900_000)).toBe("15:00");
    expect(formatClock(61_200)).toBe("1:02");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("timer state machine", () => {
  const T0 = 1_000_000;

  it("runs, pauses with the remaining time, resumes and finishes", () => {
    let timer = createTimer(60_000);
    expect(timer.status).toBe("idle");
    timer = startTimer(timer, T0);
    expect(timer.status).toBe("running");
    expect(remainingMs(timer, T0 + 10_000)).toBe(50_000);

    timer = pauseTimer(timer, T0 + 10_000);
    expect(timer).toMatchObject({ status: "paused", remainingMs: 50_000 });
    expect(remainingMs(timer, T0 + 999_000)).toBe(50_000);

    timer = startTimer(timer, T0 + 20_000);
    expect(remainingMs(timer, T0 + 30_000)).toBe(40_000);
    expect(tickTimer(timer, T0 + 69_999)).toBe(timer);

    const done = tickTimer(timer, T0 + 70_000);
    expect(done).toMatchObject({ status: "done", remainingMs: 0 });
    expect(tickTimer(done, T0 + 80_000)).toBe(done);
  });

  it("resets to the full duration and can restart after finishing", () => {
    const done = tickTimer(startTimer(createTimer(5_000), T0), T0 + 6_000);
    expect(resetTimer(done)).toEqual(createTimer(5_000));
    const again = startTimer(done, T0 + 7_000);
    expect(again.status).toBe("running");
    expect(remainingMs(again, T0 + 7_000)).toBe(5_000);
  });

  it("ignores pause when not running and start when already running", () => {
    const idle = createTimer(1_000);
    expect(pauseTimer(idle, T0)).toBe(idle);
    const running = startTimer(idle, T0);
    expect(startTimer(running, T0 + 500)).toBe(running);
  });
});
