import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { parsePath, routePath, type Route } from "@/lib/route";

export function useRoute(): { route: Route; navigate: (route: Route, options?: { replace?: boolean }) => void } {
  const { pathname } = useLocation();
  const go = useNavigate();
  const navigate = useCallback(
    (route: Route, options?: { replace?: boolean }) => void go(routePath(route), options),
    [go],
  );
  return { route: parsePath(pathname), navigate };
}
