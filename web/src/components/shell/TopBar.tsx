import { Link } from "react-router";
import { MessageCircle, SlidersHorizontal, Sparkles, Utensils } from "lucide-react";
import { navFor, routePath, type NavName, type Route } from "@/lib/route";
import { openAssist } from "@/lib/assist-store";
import { WeekSwitcher } from "./WeekSwitcher";

export const NAV_ITEMS: { name: NavName; label: string }[] = [
  { name: "uge", label: "Uge" },
  { name: "indkob", label: "Indkøb" },
  { name: "retter", label: "Retter" },
];

type Props = {
  route: Route;
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
};

const iconButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2 hover:text-ink";

/** Tablet / desktop top bar (>= 840px). */
export function TopBar({ route, weekStart, onWeekChange }: Props) {
  const active = navFor(route);
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-hairline px-6 lg:gap-6 lg:px-8">
      <Link to={routePath({ name: "uge" })} className="flex items-center gap-2.5 text-ink no-underline">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-accent text-on-accent">
          <Utensils size={20} aria-hidden="true" />
        </span>
        <strong className="font-display hidden text-[22px] font-bold tracking-tight lg:inline">Madplan</strong>
      </Link>
      <nav aria-label="Hovedmenu" className="flex gap-1 rounded-full bg-surface p-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.name}
            to={routePath({ name: item.name } as Route)}
            aria-current={active === item.name ? "page" : undefined}
            className={`flex h-11 items-center rounded-full px-[18px] text-[15px] no-underline ${
              active === item.name ? "bg-ink font-semibold text-on-accent" : "font-medium text-ink-2 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <WeekSwitcher weekStart={weekStart} onChange={onWeekChange} />
      <Link
        to={routePath({ name: "planlaeg" })}
        aria-label="Planlæg uge"
        className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-3.5 text-[15px] font-semibold text-on-accent no-underline lg:px-5"
      >
        <Sparkles size={18} aria-hidden="true" />
        <span className="hidden lg:inline">Planlæg uge</span>
      </Link>
      <button type="button" aria-label="Spørg Assist" onClick={openAssist} className={iconButton}>
        <MessageCircle size={20} aria-hidden="true" />
      </button>
      <Link to={routePath({ name: "indstillinger" })} aria-label="Indstillinger" className={iconButton}>
        <SlidersHorizontal size={20} aria-hidden="true" />
      </Link>
    </header>
  );
}
