import { Check, CircleOff } from "lucide-react";
import type { Capabilities, GroceryStore, Settings } from "@madplan/domain";
import { SectionCard, Toggle } from "@/components/ui/Controls";

const STORES: { id: GroceryStore; label: string }[] = [
  { id: "netto", label: "Netto" },
  { id: "rema1000", label: "REMA 1000" },
];

type Props = { settings: Settings; capabilities: Capabilities; onChange: (settings: Settings) => void };

function CapabilityRow({ name, on, enables, missing }: { name: string; on: boolean; enables: string; missing: string }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-raised p-3.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent-soft text-accent" : "bg-ground text-muted"}`}>
        {on ? <Check size={16} aria-hidden="true" /> : <CircleOff size={16} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[15px]">
          {name} <span className={`font-normal ${on ? "text-accent" : "text-muted"}`}>· {on ? "Aktiv" : "Ikke sat op"}</span>
        </strong>
        <span className="block text-sm leading-relaxed text-ink-2">{on ? enables : missing}</span>
      </span>
    </li>
  );
}

export function StoresSection({ settings, capabilities, onChange }: Props) {
  const toggle = (store: GroceryStore, on: boolean): void => {
    const others = settings.preferredStores.filter((item) => item !== store);
    onChange({ ...settings, preferredStores: on ? [...others, store] : others });
  };

  return (
    <SectionCard title="Butikker og tilbud" description="Vælg de butikker I handler i. Tilbud og indkøbsforslag tager udgangspunkt i dem.">
      <div className="flex flex-wrap gap-x-8 gap-y-1">
        {STORES.map((store) => (
          <Toggle key={store.id} label={store.label} checked={settings.preferredStores.includes(store.id)} onChange={(on) => toggle(store.id, on)} />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Tilsluttede tjenester">
        <CapabilityRow
          name="OpenAI"
          on={capabilities.openai}
          enables="AI-ugeplan med websøgning og levende søgning efter nye opskrifter."
          missing="Uden en API-nøgle bruger appen kun den lokale planlægning og den indbyggede opskriftssamling. Tilføj nøglen i appens konfiguration i Home Assistant."
        />
        <CapabilityRow
          name="Home Assistant Assist"
          on={capabilities.homeAssistantAgent}
          enables="Du kan stille spørgsmål til køkkenassistenten via Home Assistants samtaleagent."
          missing="Assist er ikke tilgængelig lige nu. Appen kunne ikke nå en samtaleagent i Home Assistant."
        />
        <CapabilityRow
          name="Tilbud (Prej)"
          on={capabilities.offers}
          enables="Nøglen er registreret. Visning af tilbud fra Netto og REMA 1000 er ikke med i denne version endnu."
          missing="Valgfri. Tilbud er ikke med i denne version, men nøglen kan allerede tilføjes i appens konfiguration."
        />
      </ul>
    </SectionCard>
  );
}
