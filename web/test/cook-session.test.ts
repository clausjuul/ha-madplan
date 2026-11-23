import { beforeEach, describe, expect, it } from "vitest";
import {
  activeTimers,
  cookSessions,
  finishCooking,
  resetCookSessions,
  setCookStep,
  tickCookTimers,
  updateCookTimer,
} from "../src/lib/cook-session";
import { startTimer } from "../src/lib/timer-machine";

describe("cook session store", () => {
  beforeEach(() => resetCookSessions());

  it("remembers the step per dish and survives a reload via storage", () => {
    setCookStep("lasagne", "Lasagne", 3);
    expect(cookSessions().lasagne?.step).toBe(3);
    expect(JSON.parse(localStorage.getItem("madplan:cook") ?? "{}").lasagne.step).toBe(3);
  });

  it("finishes a timer once, wherever you are", () => {
    updateCookTimer("lasagne", "Lasagne", 1, startTimer, 60);
    const endsAt = cookSessions().lasagne!.timers[1]!.endsAt!;
    expect(tickCookTimers(endsAt - 1)).toEqual([]);
    expect(tickCookTimers(endsAt)).toEqual([{ dishId: "lasagne", dishName: "Lasagne", step: 1 }]);
    expect(tickCookTimers(endsAt + 1000)).toEqual([]);
    expect(activeTimers(cookSessions())).toHaveLength(1);
  });

  it("keeps a running timer when cooking is finished, and forgets the rest", () => {
    setCookStep("lasagne", "Lasagne", 4);
    updateCookTimer("lasagne", "Lasagne", 2, startTimer, 600);
    finishCooking("lasagne");
    expect(cookSessions().lasagne?.step).toBe(0);
    expect(Object.keys(cookSessions().lasagne?.timers ?? {})).toEqual(["2"]);
    setCookStep("tacos", "Tacos", 2);
    finishCooking("tacos");
    expect(cookSessions().tacos).toBeUndefined();
  });
});
