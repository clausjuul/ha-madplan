import { useCallback, useSyncExternalStore } from "react";
import { parseHash, routeHref, type Route } from "@/lib/route";

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
const getHash = (): string => window.location.hash;

export function useRoute(): { route: Route; navigate: (route: Route) => void } {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  const navigate = useCallback((route: Route) => {
    window.location.hash = routeHref(route);
  }, []);
  return { route: parseHash(hash), navigate };
}
