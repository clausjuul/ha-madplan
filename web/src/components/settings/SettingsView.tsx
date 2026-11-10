import { useBootstrap } from "@/api/queries";
import { useHouseholdActions } from "@/api/library-mutations";
import { ErrorState } from "@/components/ui/StatusViews";
import { AppInfoSection, DataSection } from "./DataSection";
import { FamilySection } from "./FamilySection";
import { ExclusionsSection, FridgeSection } from "./HouseholdSections";
import { StoresSection } from "./StoresSection";

export function SettingsView() {
  const bootstrap = useBootstrap();
  const actions = useHouseholdActions();
  const data = bootstrap.data;

  if (bootstrap.isError && !data) return <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  if (!data) return <div className="skeleton m-6 h-64 rounded-3xl" aria-busy="true" aria-label="Henter indstillinger" />;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <h1 className="font-display m-0 text-[32px] font-bold">Indstillinger</h1>
      <FamilySection profiles={data.profiles} onChange={(profiles) => void actions.saveProfiles(profiles)} />
      <ExclusionsSection settings={data.settings} onChange={(settings) => void actions.saveSettings(settings)} />
      <FridgeSection
        fridge={data.fridge}
        pantry={data.pantry}
        onFridge={(items) => void actions.saveFridge(items)}
        onPantry={(items) => void actions.savePantry(items)}
      />
      <StoresSection settings={data.settings} capabilities={data.capabilities} onChange={(settings) => void actions.saveSettings(settings)} />
      <DataSection isEmpty={data.isEmpty} />
      <AppInfoSection />
    </div>
  );
}
