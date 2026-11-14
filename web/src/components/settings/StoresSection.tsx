import { useState } from "react";
import { Check, CircleOff, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Capabilities, GroceryStore, OffersStatus, Settings } from "@madplan/domain";
import { ApiRequestError } from "@/api/client";
import { useApi } from "@/api/provider";
import { queryKeys, useOffersStatus } from "@/api/queries";
import { SectionCard, Toggle } from "@/components/ui/Controls";
import { notify } from "@/lib/notify";

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

const STORE_LABEL: Record<GroceryStore, string> = { netto: "Netto", rema1000: "REMA 1000" };

const time = (iso: string): string => new Date(iso).toLocaleString("da-DK", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** One line per chain: when the offers were fetched and how many, or why the last attempt failed. */
export function offerLines(status: OffersStatus): string[] {
  return status.chains.map((chain) => {
    const name = STORE_LABEL[chain.chain];
    const fetched = chain.syncedAt ? `${chain.count} tilbud, hentet ${time(chain.syncedAt)}` : "ikke hentet endnu";
    return chain.error ? `${name}: ${chain.error}${chain.syncedAt ? ` (viser ${fetched})` : ""}` : `${name}: ${fetched}`;
  });
}

function OffersPanel({ stores }: { stores: GroceryStore[] }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { data: status } = useOffersStatus(true);
  const [busy, setBusy] = useState(false);
  const refresh = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await api.refreshOffers();
      queryClient.setQueryData(queryKeys.offersStatus, next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    } catch (error) {
      notify(error instanceof ApiRequestError ? error.message : "Tilbuddene kunne ikke hentes.");
    } finally {
      setBusy(false);
    }
  };
  const lines = status ? offerLines(status) : [];
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
      {stores.length === 0 ? (
        <p className="m-0">Vælg jeres butikker ovenfor, så henter Madplan deres tilbud hver morgen.</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Tilbud pr. butik">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {status ? (
            <p className="m-0 text-muted">
              {status.callsToday} af højst {status.callLimit} kald brugt i dag
              {status.remaining !== null ? ` · ${status.remaining} tilbage på nøglen` : ""}. Tilbuddene hentes én gang om morgenen.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy || status?.syncing === true}
            className="flex h-10 items-center gap-2 self-start rounded-full bg-ground px-4 text-[14px] font-medium text-ink disabled:opacity-50"
          >
            <RefreshCw size={16} aria-hidden="true" className={busy ? "animate-spin" : ""} />
            Hent tilbud nu
          </button>
        </>
      )}
      <p className="m-0 text-[13px] text-muted">
        Data fra{" "}
        <a href="https://prej.dk" target="_blank" rel="noreferrer" className="text-ink-2 underline">
          Prej
        </a>
      </p>
    </div>
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
          enables="Ugens tilbud fra jeres butikker vises på indkøbslisten og bruges, når madplanen lægges."
          missing="Valgfri. Tilføj en Prej API-nøgle i appens konfiguration for at se tilbud fra Netto og REMA 1000. Den gratis nøgle er nok."
        />
      </ul>
      {capabilities.offers ? <OffersPanel stores={settings.preferredStores} /> : null}
    </SectionCard>
  );
}
