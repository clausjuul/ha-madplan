import { createContext, useContext, type ReactNode } from "react";
import type { ApiClient } from "./client";
import { createFakeClient } from "./fake-client";
import { createHttpClient } from "./http-client";

const ApiContext = createContext<ApiClient | null>(null);

/** Fake in-memory API in dev (`VITE_FAKE_API=1` / `npm run dev`), real HTTP otherwise. */
export function createDefaultClient(): ApiClient {
  if (!__FAKE_API__) return createHttpClient();
  // `?empty` starts the demo with an empty database (shows the v1 import offer).
  const params = new URLSearchParams(window.location.search);
  // `?noassist` shows how the app looks when neither OpenAI nor a Home Assistant agent is available.
  return createFakeClient({ latencyMs: 120, openai: !params.has("noassist"), empty: params.has("empty") });
}

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("ApiProvider mangler");
  return client;
}
