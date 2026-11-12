/**
 * Voice commands for Home Assistant's own Assist: at startup the app creates three automations with a
 * sentence trigger ("hvad skal vi have i aften?") that answer from the Madplan sensors. They go through
 * Home Assistant's automation config API, so nothing has to be pasted into YAML and no restart is needed.
 *
 * Only automations carrying our marker are ever touched: a user who edits one and removes the marker
 * keeps their version, and the `voice_commands` option switches the whole thing off (and removes ours).
 */
const API = "http://supervisor/core/api/config/automation/config/";
const MARKER = "Oprettet af Madplan";
/** Bump when the automations below change, so existing installs are updated. */
export const VOICE_VERSION = 1;

export type VoiceAutomation = {
  id: string;
  alias: string;
  description: string;
  mode: "single";
  trigger: { platform: "conversation"; command: string[] }[];
  condition: never[];
  action: { set_conversation_response: string }[];
};

const automation = (id: string, alias: string, command: string[], response: string): VoiceAutomation => ({
  id,
  alias,
  description: `${MARKER} (stemme v${VOICE_VERSION}). Slå "voice_commands" fra i Madplans konfiguration for at fjerne den, eller slet denne linje for at beholde din egen udgave.`,
  mode: "single",
  trigger: [{ platform: "conversation", command }],
  condition: [],
  action: [{ set_conversation_response: response }],
});

export const VOICE_AUTOMATIONS: readonly VoiceAutomation[] = [
  automation(
    "madplan_stemme_i_aften",
    "Madplan: Hvad skal vi have i aften?",
    ["hvad skal vi (have|spise) [til aftensmad] i aften", "hvad er der til aftensmad [i aften]", "hvad skal vi have til aftensmad"],
    "{% set ret = states('sensor.madplan_i_aften') %}" +
      "{% if ret in ['Ingen ret', 'unknown', 'unavailable'] %}Der er ikke planlagt noget i aften." +
      "{% else %}I aften skal I have {{ ret }}.{% endif %}",
  ),
  automation(
    "madplan_stemme_i_morgen",
    "Madplan: Hvad skal vi have i morgen?",
    ["hvad skal vi (have|spise) [til aftensmad] i morgen", "hvad er der til aftensmad i morgen"],
    "{% set ret = state_attr('sensor.madplan_i_aften', 'tomorrow') %}" +
      "{% if ret in [none, 'Ingen ret'] %}Der er ikke planlagt noget i morgen." +
      "{% else %}I morgen skal I have {{ ret }}.{% endif %}",
  ),
  automation(
    "madplan_stemme_indkob",
    "Madplan: Hvad mangler vi at købe?",
    ["hvad mangler vi [at købe]", "hvad står der på indkøbslisten", "hvad skal vi købe [ind]", "læs indkøbslisten [op]"],
    "{% set varer = state_attr('sensor.madplan_indkob', 'items') or [] %}" +
      "{% if varer | count == 0 %}Indkøbslisten er tom." +
      "{% elif varer | count <= 10 %}I mangler {{ varer | join(', ') }}." +
      "{% else %}I mangler {{ varer[:10] | join(', ') }} og {{ varer | count - 10 }} andre ting.{% endif %}",
  ),
];

export type VoiceOutcome = "created" | "updated" | "unchanged" | "kept" | "removed" | "absent";

type Existing = { description?: unknown } | null;

async function readExisting(token: string, fetcher: typeof fetch, id: string): Promise<Existing> {
  const response = await fetcher(`${API}${id}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Existing;
}

const ours = (existing: Existing): boolean => typeof existing?.description === "string" && existing.description.includes(MARKER);

/** Creates, updates or (when disabled) removes one automation; leaves user-owned versions alone. */
export async function syncVoiceAutomation(
  token: string,
  fetcher: typeof fetch,
  wanted: VoiceAutomation,
  enabled: boolean,
): Promise<VoiceOutcome> {
  const existing = await readExisting(token, fetcher, wanted.id);
  if (!enabled) {
    if (!existing) return "absent";
    if (!ours(existing)) return "kept";
    const response = await fetcher(`${API}${wanted.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return "removed";
  }
  if (existing && !ours(existing)) return "kept";
  if (existing && existing.description === wanted.description) return "unchanged";
  const response = await fetcher(`${API}${wanted.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(wanted),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return existing ? "updated" : "created";
}

/** Startup wiring; best-effort, never throws. */
export async function setupVoice(config: { supervisorToken: string; voiceCommands: boolean }, fetcher: typeof fetch = fetch): Promise<void> {
  if (!config.supervisorToken) return;
  for (const wanted of VOICE_AUTOMATIONS) {
    try {
      const outcome = await syncVoiceAutomation(config.supervisorToken, fetcher, wanted, config.voiceCommands);
      if (outcome === "created") console.log(`Stemmekommando oprettet: ${wanted.alias}`);
      else if (outcome === "updated") console.log(`Stemmekommando opdateret: ${wanted.alias}`);
      else if (outcome === "removed") console.log(`Stemmekommando fjernet: ${wanted.alias}`);
    } catch (error) {
      console.warn(
        `Kunne ikke oprette stemmekommandoen "${wanted.alias}" (${error instanceof Error ? error.message : String(error)}). ` +
          "Kræver at automations.yaml er inkluderet i configuration.yaml (standard i nye installationer).",
      );
    }
  }
}
