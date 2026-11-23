import { Link } from "react-router";
import { ArrowLeft, BookOpen, CalendarDays, MessageCircle, Settings, ShoppingCart, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { navFor, planRouteFor, routePath, screenTitle, type NavName, type Route } from "@/lib/route";
import { useBack } from "@/hooks/use-back";
import { WeekSwitcher, weekTitle } from "./WeekSwitcher";
import { openAssist } from "@/lib/assist-store";

const ITEMS: { name: NavName; label: string; icon: ReactNode }[] = [
  { name: "uge", label: "Uge", icon: <CalendarDays size={22} aria-hidden="true" /> },
  { name: "indkob", label: "Indkøb", icon: <ShoppingCart size={22} aria-hidden="true" /> },
  { name: "retter", label: "Retter", icon: <BookOpen size={22} aria-hidden="true" /> },
  { name: "planlaeg", label: "Planlæg", icon: <Sparkles size={22} aria-hidden="true" /> },
];

const roundButton = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2";

type HeaderProps = { route: Route; weekStart: string; onWeekChange: (weekStart: string) => void };

/** Assist and settings: the same two buttons in the top right of every phone screen. */
export function HeaderActions({ route }: { route: Route }) {
  const onSettings = route.name === "indstillinger";
  return (
    <>
      <button type="button" aria-label="Spørg Assist" onClick={() => openAssist()} className={`ml-0.5 ${roundButton}`}>
        <MessageCircle size={20} aria-hidden="true" />
      </button>
      <Link
        to={routePath({ name: "indstillinger" })}
        aria-label="Indstillinger"
        aria-current={onSettings ? "page" : undefined}
        className={`ml-0.5 ${roundButton} ${onSettings ? "!bg-accent !text-on-accent" : ""}`}
      >
        <Settings size={20} aria-hidden="true" />
      </Link>
    </>
  );
}

export function PhoneHeader({ route, weekStart, onWeekChange }: HeaderProps) {
  const back = useBack({ name: "uge" });
  if (route.name !== "uge") {
    // Other screens are not about a week: show the screen's name instead of the week switcher.
    return (
      <header className="flex shrink-0 items-center gap-1 px-4 pb-2.5 pt-[18px]">
        {route.name === "indstillinger" ? (
          <button type="button" onClick={back} aria-label="Tilbage" className={`-ml-1 mr-1 ${roundButton}`}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : null}
        <h1 className="font-display m-0 min-w-0 flex-1 truncate text-[26px] font-bold leading-tight">{screenTitle(route)}</h1>
        <HeaderActions route={route} />
      </header>
    );
  }
  const { title, range } = weekTitle(weekStart);
  return (
    <header className="flex shrink-0 items-center gap-1 px-4 pb-2.5 pt-[18px]">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-muted">
          {title} · {range.replace("november", "nov.").replace("december", "dec.").replace("januar", "jan.")}
        </div>
        <strong className="font-display text-[26px] font-bold leading-tight">Madplan</strong>
      </div>
      <WeekSwitcher compact weekStart={weekStart} onChange={onWeekChange} />
      <HeaderActions route={route} />
    </header>
  );
}

export function BottomNav({ route }: { route: Route }) {
  const active = navFor(route);
  return (
    <nav
      aria-label="Hovedmenu"
      className="grid h-[76px] shrink-0 grid-cols-4 border-t border-hairline bg-ground px-2 pb-2.5 pt-1.5"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      {ITEMS.map((item) => (
        <Link
          key={item.name}
          to={routePath(item.name === "planlaeg" ? planRouteFor(route) : ({ name: item.name } as Route))}
          aria-current={active === item.name ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-1 text-xs no-underline ${
            active === item.name ? "font-semibold text-accent" : "font-medium text-muted"
          }`}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
