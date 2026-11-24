import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router";
import { App } from "./App";
import { ApiProvider, createDefaultClient } from "./api/provider";
import { followHaTheme } from "./lib/ha-theme";
import { reloadOnce } from "./lib/reload-once";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});
const client = createDefaultClient();

// A lazy chunk from the previous version is gone after an update: load the new version once.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnce()) event.preventDefault();
});

try {
  followHaTheme();
} catch (error) {
  console.error("Kunne ikke følge Home Assistants tema", error);
}

const container = document.getElementById("root");
if (!container) throw new Error("#root mangler");

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <ApiProvider client={client}>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <App />
          </HashRouter>
        </QueryClientProvider>
      </ApiProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
