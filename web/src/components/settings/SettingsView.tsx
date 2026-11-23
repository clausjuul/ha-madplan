import { Link } from "react-router";
import { useBootstrap } from "@/api/queries";
import { useIsWide } from "@/hooks/use-media";
import { useHouseholdActions } from "@/api/library-mutations";
import { ErrorState } from "@/components/ui/StatusViews";
import { routePath, type SettingsTab } from "@/lib/route";
import { AppInfoSection, DataSection } from "./DataSection";
import { FamilySection } from "./FamilySection";
import { ExclusionsSection, FridgeSection } from "./HouseholdSections";
import { StoresSection } from "./StoresSection";

const TABS: readonly { tab: SettingsTab | undefined; label: string }[] = [
  { tab: undefined, label: "Familien" },
  { tab: "mad", label: "Mad og køleskab" },
  { tab: "butikker", label: "Butikker" },
  { tab: "data", label: "Data" },
];

const tabClass = (active: boolean): string =>
  `flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[15px] no-underline sm:px-5 ${
    active ? "bg-ink font-semibold text-ground" : "font-medium text-ink-2 hover:text-ink"
  }`;

/** `#/indstillinger[/mad|/butikker|/data]`. */
export function SettingsView({ tab }: { tab?: SettingsTab }) {
  const bootstrap = useBootstrap();
  const actions = useHouseholdActions();
  const wide = useIsWide();
  const data = bootstrap.data;

  if (bootstrap.isError && !data) return <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  if (!data) return <div className="skeleton m-6 h-64 rounded-3xl" aria-busy="true" aria-label="Henter indstillinger" />;

  let body;
  if (tab === "mad") {
    body = (
      <>
        <ExclusionsSection settings={data.settings} onChange={(settings) => void actions.saveSettings(settings)} />
        <FridgeSection
          fridge={data.fridge}
          pantry={data.pantry}
          onFridge={(items) => void actions.saveFridge(items)}
          onPantry={(items) => void actions.savePantry(items)}
        />
      </>
    );
  } else if (tab === "butikker") {
    body = <StoresSection settings={data.settings} capabilities={data.capabilities} onChange={(settings) => void actions.saveSettings(settings)} />;
  } else if (tab === "data") {
    body = (
      <>
        <DataSection isEmpty={data.isEmpty} />
        <AppInfoSection />
      </>
    );
  } else {
    body = <FamilySection profiles={data.profiles} onChange={(profiles) => void actions.saveProfiles(profiles)} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-10 pt-4 md:px-6 md:pt-6">
      {/* On a phone the header already says "Indstillinger". */}
      {wide ? <h1 className="font-display m-0 text-[32px] font-bold">Indstillinger</h1> : null}
      <nav
        role="tablist"
        aria-label="Indstillinger"
        className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1"
      >
        {TABS.map((entry) => (
          <Link
            key={entry.label}
            role="tab"
            aria-selected={tab === entry.tab}
            to={routePath({ name: "indstillinger", ...(entry.tab ? { tab: entry.tab } : {}) })}
            className={tabClass(tab === entry.tab)}
          >
            {entry.label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
