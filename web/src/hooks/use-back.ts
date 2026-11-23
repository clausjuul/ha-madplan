import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { routePath, type Route } from "@/lib/route";

/**
 * "Close" that behaves like back: returns to where the person came from inside the app,
 * or to `fallback` when the screen was opened directly (a link, a reload, a new tab).
 */
export function useBack(fallback: Route): () => void {
  const location = useLocation();
  const go = useNavigate();
  const fallbackPath = routePath(fallback);
  return useCallback(() => {
    if (location.key !== "default") void go(-1);
    else void go(fallbackPath, { replace: true });
  }, [location.key, go, fallbackPath]);
}
