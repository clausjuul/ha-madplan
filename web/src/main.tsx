import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ApiProvider, createDefaultClient } from "./api/provider";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});
const client = createDefaultClient();

const container = document.getElementById("root");
if (!container) throw new Error("#root mangler");

createRoot(container).render(
  <StrictMode>
    <ApiProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ApiProvider>
  </StrictMode>,
);
