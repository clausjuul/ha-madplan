import { Link } from "react-router";
import { BookOpen, CalendarDays, MessageCircle, ShoppingCart, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { navFor, routePath, type NavName, type Route } from "@/lib/route";
import { WeekSwitcher, weekTitle } from "./WeekSwitcher";
import { openAssist } from "@/lib/assist-store";

const ITEMS: { name: NavName; label: string; icon: ReactNode }[] = [
  { name: "uge", label: "Uge", icon: <CalendarDays size={22} aria-hidden="true" /> },
  { name: "indkob", label: "Indkøb", icon: <ShoppingCart size={22} aria-hidden="true" /> },
  { name: "retter", label: "Retter", icon: <BookOpen size={22} aria-hidden="true" /> },
  { name: "planlaeg", label: "Planlæg", icon: <Sparkles size={22} aria-hidden="true" /> },
];

type HeaderProps = { weekStart: string; onWeekChange: (weekStart: string) => void };

export function PhoneHeader({ weekStart, onWeekChange }: HeaderProps) {
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
      <button
        type="button"
        aria-label="Spørg Assist"
        onClick={openAssist}
        className="ml-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-2"
      >
        <MessageCircle size={20} aria-hidden="true" />
      </button>
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
          to={routePath({ name: item.name } as Route)}
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
