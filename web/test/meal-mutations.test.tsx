import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MealMap } from "@madplan/domain";
import { ApiRequestError, type ApiClient } from "../src/api/client";
import { createFakeClient } from "../src/api/fake-client";
import { useMealActions } from "../src/api/meal-mutations";
import { ApiProvider } from "../src/api/provider";
import { useBootstrap } from "../src/api/queries";
import { dismissNotice } from "../src/lib/notify";

const TODAY = "2026-11-09";
const A = "2026-11-10"; // laks
const B = "2026-11-15"; // tacos

function setup(override: Partial<ApiClient> = {}) {
  const client: ApiClient = { ...createFakeClient({ today: TODAY }), ...override };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiProvider>
  );
  const hook = renderHook(
    () => {
      const bootstrap = useBootstrap();
      const actions = useMealActions(bootstrap.data?.meals);
      return { meals: bootstrap.data?.meals, actions };
    },
    { wrapper },
  );
  return hook;
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("meal mutations", () => {
  it("applies a swap optimistically, then settles on the server state", async () => {
    const gate = deferred<MealMap>();
    const hook = setup({ swapMeals: () => gate.promise });
    await waitFor(() => expect(hook.result.current.meals).toBeDefined());

    let pending!: Promise<boolean>;
    act(() => {
      pending = hook.result.current.actions.swap(A, B);
    });
    await waitFor(() => expect(hook.result.current.meals?.[A]?.dishId).toBe("tacos"));
    expect(hook.result.current.meals?.[B]?.dishId).toBe("laks");

    await act(async () => {
      gate.resolve({});
      await pending;
    });
  });

  it("rolls the swap back and shows a gentle message when the server refuses", async () => {
    dismissNotice();
    const gate = deferred<MealMap>();
    const hook = setup({ swapMeals: () => gate.promise });
    await waitFor(() => expect(hook.result.current.meals).toBeDefined());
    const before = hook.result.current.meals;

    let pending!: Promise<boolean>;
    act(() => {
      pending = hook.result.current.actions.swap(A, B);
    });
    await waitFor(() => expect(hook.result.current.meals?.[A]?.dishId).toBe("tacos"));

    await act(async () => {
      gate.reject(new ApiRequestError(409, "locked", "Dagen er låst. Lås den op først."));
      await pending;
    });

    await waitFor(() => expect(hook.result.current.meals?.[A]?.dishId).toBe("laks"));
    expect(hook.result.current.meals?.[B]?.dishId).toBe("tacos");
    expect(hook.result.current.meals).toEqual(before);
  });

  it("refuses a swap with a locked day without calling the server", async () => {
    let called = false;
    const hook = setup({
      swapMeals: () => {
        called = true;
        return Promise.resolve({});
      },
    });
    await waitFor(() => expect(hook.result.current.meals).toBeDefined());
    let attempted = true;
    await act(async () => {
      attempted = await hook.result.current.actions.swap(A, "2026-11-13");
    });
    expect(attempted).toBe(false);
    expect(called).toBe(false);
    expect(hook.result.current.meals?.[A]?.dishId).toBe("laks");
  });

  it("removes a meal optimistically and restores it on failure", async () => {
    const gate = deferred<void>();
    const hook = setup({ deleteMeal: () => gate.promise });
    await waitFor(() => expect(hook.result.current.meals).toBeDefined());

    act(() => hook.result.current.actions.removeMeal(A));
    await waitFor(() => expect(hook.result.current.meals?.[A]).toBeUndefined());

    await act(async () => {
      gate.reject(new ApiRequestError(500, "boom", "Noget gik galt."));
      await gate.promise.catch(() => undefined);
    });
    await waitFor(() => expect(hook.result.current.meals?.[A]?.dishId).toBe("laks"));
  });
});
