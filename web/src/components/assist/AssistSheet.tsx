import { useApi } from "@/api/provider";
import { useBootstrap } from "@/api/queries";
import { useAssistChat } from "@/hooks/use-assist-chat";
import { useRoute } from "@/hooks/use-route";
import { closeAssist, useAssistOpen } from "@/lib/assist-store";
import { contextFor, engineTitle } from "@/lib/assist-model";
import { Sheet } from "@/components/ui/Sheet";
import { Conversation } from "./Conversation";

function Unavailable() {
  return (
    <div className="flex flex-col gap-3 px-3 pb-2 text-[15px] leading-relaxed text-ink-2">
      <p className="m-0">Assist er ikke sat op endnu, så der er ingen at snakke med.</p>
      <p className="m-0">
        Tilføj en OpenAI API-nøgle i Madplans konfiguration i Home Assistant, så kan Assist foreslå ændringer i madplanen.
        Alternativt kan du slå en samtaleagent til i Home Assistant, så kan Assist svare på spørgsmål.
      </p>
      <p className="m-0">Imens kan du bruge Foreslå på en dag, der vælger blandt jeres egne retter.</p>
    </div>
  );
}

/** The Assist chat, opened from the chat icon in the top bar or the phone header. */
export function AssistSheet() {
  const open = useAssistOpen();
  const api = useApi();
  const { route } = useRoute();
  const capabilities = useBootstrap().data?.capabilities;
  const context = contextFor(route);
  const chat = useAssistChat(context);

  const available = capabilities ? capabilities.openai || capabilities.homeAssistantAgent : true;
  // Prefer what really answered last; before that, what is configured (OpenAI wins, as on the server).
  const engine = chat.session.engine ?? (capabilities?.openai === false && capabilities.homeAssistantAgent ? "homeassistant" : "openai");
  const heading = available
    ? engineTitle(engine, api.mode === "fake")
    : { title: "Assist er ikke tilgængelig" };

  return (
    <Sheet open={open} onClose={closeAssist} title={heading.title} subtitle={heading.subtitle} tall={available}>
      {available ? <Conversation context={context} chat={chat} demo={api.mode === "fake"} /> : <Unavailable />}
    </Sheet>
  );
}
