import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "../src/hooks/use-today";

describe("useToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the local date key", () => {
    vi.setSystemTime(new Date(2026, 10, 9, 18, 30));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-11-09");
  });

  it("ticks over at local midnight", () => {
    vi.setSystemTime(new Date(2026, 10, 9, 23, 59, 0));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-11-09");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe("2026-11-09");

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current).toBe("2026-11-10");
  });

  it("keeps ticking on the following nights", () => {
    vi.setSystemTime(new Date(2026, 10, 9, 23, 59, 30));
    const { result } = renderHook(() => useToday());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-11-10");
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(result.current).toBe("2026-11-11");
  });

  it("refreshes when the tab becomes visible again", () => {
    vi.setSystemTime(new Date(2026, 10, 9, 12, 0));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-11-09");

    // The device slept: the clock jumped without any timer firing.
    vi.setSystemTime(new Date(2026, 10, 12, 8, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-11-12");
  });

  it("stops timers on unmount", () => {
    vi.setSystemTime(new Date(2026, 10, 9, 12, 0));
    const { unmount } = renderHook(() => useToday());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
