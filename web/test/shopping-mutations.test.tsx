import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShoppingList } from "@madplan/domain";
import { ApiRequestError, type ApiClient } from "../src/api/client";
import { createFakeClient } from "../src/api/fake-client";
import { ApiProvider } from "../src/api/provider";
import { useShopping } from "../src/api/queries";
import { useShoppingActions } from "../src/api/shopping-mutations";
import { dismissNotice } from "../src/lib/notify";

const TODAY = "2026-11-09";

function setup(override: Partial<ApiClient> = {}) {
  const client: ApiClient = { ...createFakeClient({ today: TODAY }), ...override };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiProvider>
  );
  return renderHook(
    () => ({ list: useShopping().data, actions: useShoppingActions() }),
    { wrapper },
  );
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

describe("shopping mutations", () => {
  it("checks an item optimistically, then settles on the server state", async () => {
    const gate = deferred<ShoppingList>();
    const fake = createFakeClient({ today: TODAY });
    const hook = setup({ toggleShoppingItem: (id) => gate.promise.then(() => fake.toggleShoppingItem(id)) });
    await waitFor(() => expect(hook.result.current.list).toBeDefined());
    const id = hook.result.current.list?.items[0]?.id ?? "";

    act(() => hook.result.current.actions.toggle(id));
    await waitFor(() => expect(hook.result.current.list?.items.find((i) => i.id === id)?.checked).toBe(true));
    expect(hook.result.current.list?.checkedCount).toBe(1);

    await act(async () => gate.resolve(hook.result.current.list as ShoppingList));
    await waitFor(() => expect(hook.result.current.list?.items.find((i) => i.id === id)?.checked).toBe(true));
  });

  it("rolls back and tells the user when the toggle fails", async () => {
    dismissNotice();
    const hook = setup({
      toggleShoppingItem: () => Promise.reject(new ApiRequestError(500, "boom", "Serveren svarede ikke.")),
    });
    await waitFor(() => expect(hook.result.current.list).toBeDefined());
    const id = hook.result.current.list?.items[0]?.id ?? "";

    act(() => hook.result.current.actions.toggle(id));
    await waitFor(() => expect(hook.result.current.list?.items.find((i) => i.id === id)?.checked).toBe(false));
    expect(hook.result.current.list?.checkedCount).toBe(0);
  });

  it("removes an extra with the id the list returned", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.list).toBeDefined());
    act(() => hook.result.current.actions.addExtra("2 liter Mælk"));
    await waitFor(() => expect(hook.result.current.list?.items.some((i) => i.extra)).toBe(true));
    const extra = hook.result.current.list?.items.find((i) => i.extra);
    expect(extra?.id).toBe("extra:2 liter mælk");

    act(() => hook.result.current.actions.removeExtra(extra?.id ?? ""));
    await waitFor(() => expect(hook.result.current.list?.items.some((i) => i.extra)).toBe(false));
  });
});
