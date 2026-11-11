import { dateKey, isDateKey, parseDateKey, startOfWeek } from "@madplan/domain";

export type Route =
  | { name: "uge"; week?: string }
  | { name: "indkob" }
  | { name: "retter"; dishId?: string; tab?: "opdag" }
  | { name: "planlaeg" }
  | { name: "indstillinger" }
  | { name: "lav-mad"; dishId: string };

export type NavName = "uge" | "indkob" | "retter" | "planlaeg";

export const mondayOf = (key: string): string => dateKey(startOfWeek(parseDateKey(key)));

/** Parses a router pathname ("/uge/2026-11-09") or a legacy hash ("#/uge/2026-11-09"). */
export function parsePath(path: string): Route {
  const [first = "", second = ""] = path.replace(/^#?\/?/u, "").split("/");
  switch (first) {
    case "indkob":
    case "planlaeg":
    case "indstillinger":
      return { name: first };
    case "retter":
      if (second === "opdag") return { name: "retter", tab: "opdag" };
      return second ? { name: "retter", dishId: decodeURIComponent(second) } : { name: "retter" };
    case "lav-mad":
      return { name: "lav-mad", dishId: decodeURIComponent(second) };
    default:
      return isDateKey(second) ? { name: "uge", week: mondayOf(second) } : { name: "uge" };
  }
}

export const parseHash = parsePath;

/** The router path for a route, for `<Link to>` and `navigate()`. */
export function routePath(route: Route): string {
  switch (route.name) {
    case "uge":
      return route.week ? `/uge/${route.week}` : "/uge";
    case "lav-mad":
      return `/lav-mad/${encodeURIComponent(route.dishId)}`;
    case "retter":
      if (route.dishId) return `/retter/${encodeURIComponent(route.dishId)}`;
      return route.tab === "opdag" ? "/retter/opdag" : "/retter";
    default:
      return `/${route.name}`;
  }
}

/** The full hash href (HashRouter), e.g. for plain links outside the router. */
export const routeHref = (route: Route): string => `#${routePath(route)}`;

/** Which top-level navigation item a route belongs to. */
export function navFor(route: Route): NavName | undefined {
  if (route.name === "indstillinger") return undefined;
  if (route.name === "lav-mad") return "uge";
  return route.name;
}
