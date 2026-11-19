# Plan: Madplan-integration til Home Assistant (indkøbsliste som todo og madplan som kalender)

Status: bygget 2026-11-19 (fase 0–5, undtagen test på den rigtige Home Assistant efter release). Entiteterne hedder `todo.madplan_shopping_list` og `calendar.madplan` (entity-id'er dannes ud fra de engelske navne).

**Afvigelse fra planen:** stemme-automationerne "Tilføj/Fjern fra indkøbslisten" bliver. Husstanden har også Home Assistants egen "Indkøbsliste" (`todo.indkobsliste`), så uden automationerne ville "tilføj mælk til indkøbslisten" ramme den liste i stedet for Madplans. Fase 0 viste, at stemme-løsningen virker fra ende til anden, og at Supervisor discovery ikke begrænser servicenavne (custom integrationer kan modtage den).

## Mål

Madplan skal ses i Home Assistant som rigtige entiteter i stedet for automationer og tilstande, der er skrevet udefra:

- **`todo.madplan_indkob`**: indkøbslisten. Så virker Home Assistants egne Assist-sætninger ("tilføj mælk til indkøbslisten", "sæt hak ved mælk"), AI-samtaleagenter, To-do-kortet, listen i Home Assistant-appen og `todo.add_item` i automationer, uden at vi selv vedligeholder sætninger.
- **`calendar.madplan`**: madplanen. Aftensmaden ses i Home Assistants kalender og på dashboards, Assist kan svare på "hvad skal vi have på torsdag?", og automationer kan reagere på dagens ret.

**Krav:** appen skal blive ved med at virke uden integrationen. Integrationen er et tilvalg, der sætter sig selv op.

## Hvorfor det kræver en integration

En app (add-on) kan ikke registrere entiteter, services eller intents i Home Assistant. Den kan kun skrive tilstande (`/api/states`, som `sensor.madplan_*` i dag), oprette automationer og sende events. En rigtig `todo`- eller `calendar`-entitet kræver Python-kode, der kører inde i Home Assistant: en **custom integration** i `custom_components/madplan`. Frigate og Music Assistant bruger samme model med en app og en integration, der hører sammen.

## Arkitektur

```
Home Assistant Core                         Madplan-appen (container)
┌──────────────────────────────┐            ┌──────────────────────────────┐
│ custom_components/madplan    │  HTTP+SSE  │ Internt API  :8100           │
│  config_flow (hassio)        │ ─────────► │  /internal/v1/...            │
│  coordinator                 │ ◄───────── │  nøgle i /data               │
│  todo.madplan_indkob         │  ændringer │ Ingress-UI   :8099 (uændret) │
│  calendar.madplan            │            │                              │
└──────────────────────────────┘            └──────────────────────────────┘
          ▲  Supervisor discovery ("madplan": host, port, nøgle)  │
          └───────────────────────────────────────────────────────┘
```

### 1. Appen: internt API (TypeScript)

- **Egen port, 8100**, kun på Supervisors interne netværk. Den står ikke under `ports:` i `config.yaml`, så den kan ikke nås udefra. Ingress-guarden på 8099 (`server/src/security.ts`) forbliver uændret.
- **Godkendelse:** appen laver en tilfældig nøgle ved første start og gemmer den i `/data/internal-token`. Hvert kald kræver `Authorization: Bearer <nøgle>`. Forkert nøgle giver 401, og fejlede forsøg logges.
- **Endepunkter** (alle under `/internal/v1`, så API'et kan versioneres):
  - `GET /info`: appens version, `api_version` og navn.
  - `GET /shopping`: den aktuelle liste (`currentShoppingList`), med id, navn, mængde, retter, hak og om varen er ekstra.
  - `POST /shopping/items`: tilføjer en ekstra vare (samme regler som `addSpokenItems`: dubletter afvises, og en afkrydset vare får fjernet sit hak).
  - `PATCH /shopping/items/:id`: sætter eller fjerner hak (`checked`) og omdøber (`label`, kun for ekstra varer).
  - `DELETE /shopping/items/:id`: sletter en ekstra vare. En vare fra madplanen bliver afkrydset (se "Beslutninger").
  - `GET /meals?from&to`: planlagte dage med ret, note og tilberedningstid.
  - `GET /events`: SSE med `change`-events, genbrugt fra `server/src/routes/data.ts`, så integrationen opdaterer med det samme.
- **Ændringerne går gennem de samme funktioner som web-UI'et** (`repo.mutate`, `setShoppingState`), så UI'et og sensorerne opdateres som altid. Logikken fra `server/src/ha/voice-shopping.ts` flyttes til `server/src/services/shopping-edit.ts` og bruges af både API'et og (indtil videre) stemme-eventet.
- **Discovery:** `discovery: [madplan]` tilføjes i `madplan/config.yaml`. Ved opstart sender appen `POST http://supervisor/discovery` med `{ service: "madplan", config: { host, port: 8100, token } }`. `host` er appens hostname fra `GET http://supervisor/addons/self/info`, f.eks. `local-madplan` eller `<hash>-madplan`.

### 2. Integrationen (Python)

Ligger i repoet som `integration/custom_components/madplan/`:

- `manifest.json`: domæne `madplan`, `config_flow: true`, `iot_class: local_push` og `version` (holdes lig appens version af `server/test/version.test.ts`).
- `config_flow.py`:
  - `async_step_hassio` modtager discovery og viser "Madplan fundet, vil du tilføje den?".
  - `async_step_user` er en manuel fallback med host og nøgle.
  - Ved ny discovery (ny nøgle eller nyt hostname) opdateres den eksisterende opsætning i stedet for at lave en ny.
- `coordinator.py`:
  - En `DataUpdateCoordinator` henter `/shopping` og `/meals` og lytter på `/events` via `aiohttp`. Ved et `change` hentes data igen.
  - Falder SSE ud, genforbindes der med back-off, og der hentes hvert 5. minut som sikkerhedsnet.
  - Entiteterne bliver `unavailable`, mens appen er stoppet.
- `todo.py`: `MadplanShoppingList(TodoListEntity)`.
  - Funktioner: `CREATE_TODO_ITEM`, `UPDATE_TODO_ITEM` og `DELETE_TODO_ITEM`.
  - En vare bliver til `TodoItem(uid=id, summary=navn, status=needs_action/completed, description="500 g · Lasagne, Tacos")`.
  - Omdøbning af en vare fra madplanen giver en `HomeAssistantError`: "Varer fra madplanen kan ikke omdøbes. Ret opskriften i Madplan."
  - Navn: "Indkøbsliste", så Assists `{name}` matcher "indkøbslisten" (afklares i fase 0).
- `calendar.py`: `MadplanCalendar(CalendarEntity)`, kun læsning i første omgang.
  - Hver planlagt dag bliver en begivenhed: titlen er retten, beskrivelsen er note og tilberedningstid, og der er et link til appen.
  - **Tidspunkt:** heldagsbegivenhed som standard. Har familien sat et aftensmadstidspunkt, bruges det i stedet (f.eks. 17:30 minus tilberedningstid til 18:30), så "start madlavning"-automationer kan bruge kalenderens udløser.
  - `event` (næste eller igangværende begivenhed) og `async_get_events(start, slut)` læser fra coordinatoren.
  - Dage markeret "ikke spist" vises ikke.
- `diagnostics.py` viser appens version og API-version, men ikke nøglen.
- `translations/da.json` og `en.json`.

### 3. Installation og opdatering

- **Appen installerer integrationen selv**, ligesom dashboard-kortene (`server/src/ha/cards.ts`). Den kopierer `custom_components/madplan` fra imaget til `/config/custom_components/madplan`, når versionen i `manifest.json` er en anden end den installerede.
- **Hvis en bruger har sin egen udgave**, f.eks. fra HACS, rører appen den ikke. Det afgøres ud fra en markørfil (`.installed-by-madplan`), som appen selv lægger i mappen, ligesom markøren i stemme-automationerne.
- **Genstart:** når filerne er nye eller ændrede, opretter appen en notifikation (`persistent_notification.create`): "Genstart Home Assistant for at aktivere Madplan-integrationen". Appen genstarter aldrig Home Assistant selv.
- **Version i utakt** (appen er opdateret, men Home Assistant er ikke genstartet): API'et er bagudkompatibelt inden for `v1`, og integrationen ignorerer felter, den ikke kender. Er appens `api_version` nyere end integrationens, laver integrationen en Repairs-meddelelse om at genstarte.
- Ny indstilling `ha_integration: true` i appens konfiguration, så automatisk installation kan slås fra.
- `Dockerfile`: `COPY integration/custom_components custom_components`.

### 4. Oprydning i stemme-automationerne

- Når integrationen er installeret og kører, skal "Madplan: Tilføj/Fjern fra indkøbslisten" fjernes. Ellers konkurrerer de med Home Assistants egne sætninger, som nu rammer `todo.madplan_indkob`.
- `setupVoice` får en liste over udgåede id'er (`madplan_stemme_tilfoj` og `madplan_stemme_fjern`), som slettes, hvis de er vores (markøren). `VOICE_VERSION` bliver 3.
- Lytteren i `voice-shopping.ts` og eventet `madplan_stemme` fjernes i samme omgang.
- De fire læsende automationer bliver. "Hvad mangler vi at købe?" kan senere klares af Home Assistants egen `HassListGetItems` (afklares i fase 0).

## Faser og tidsforbrug

| Fase | Indhold | Tid |
| --- | --- | --- |
| **0. Afklaring** | Lille prototype på den rigtige Home Assistant: (a) når Supervisor discovery frem til en *custom* integration, (b) kan Core nå appens port 8100 på det interne netværk, (c) matcher de danske Assist-sætninger en todo-liste med navnet "Indkøbsliste", (d) hvordan den opfører sig ved siden af Home Assistants egen indkøbsliste | ½ dag |
| **1. Internt API** | Port 8100, nøgle, endepunkter, SSE, discovery og tests (vitest) | 1 dag |
| **2. Integration: todo** | Config flow, coordinator, todo-entitet, oversættelser, tests med `pytest-homeassistant-custom-component` og et Python-job i CI | 1½–2 dage |
| **3. Integration: kalender** | Kalender-entitet, tidspunkt ud fra aftensmadstid, tests | ½–1 dag |
| **4. Installation og oprydning** | Kopiering med markør, genstart-notifikation, Repairs, `ha_integration`-indstilling, fjernelse af stemme-tilføj/fjern | 1 dag |
| **5. Test og dokumentation** | Hele forløbet på jeres Home Assistant: ny installation, opdatering, appen stoppet, Assist med og uden AI. DOCS.md, README og oversættelser | ½–1 dag |
| **I alt** | | **cirka 5–6½ dage** |

Fase 0 kommer først, fordi den kan ændre planen. Når custom integrationer ikke kan modtage discovery, bliver opsætningen manuel (host og nøgle vises under appens **Info**). Når port 8100 ikke kan nås, bruges 8099 med en egen sti, og guarden skal også tillade Cores adresse (172.30.32.1) med nøgle.

## Beslutninger

Det her er mine anbefalinger fra samtalen 2026-11-19. Ret dem, hvis I er uenige.

1. **Installation:** appen installerer integrationen selv. HACS kan komme senere til andre brugere.
2. **Stemme-tilføj/fjern:** de bliver, indtil fase 4 er færdig, så funktionen virker i mellemtiden.
3. **"Slet" på en vare fra madplanen:** varen afkrydses i stedet for at give en fejl. Home Assistants "Ryd fuldførte" gør så ingenting ved madplanens varer og sletter kun de ekstra varer, der er afkrydset.
4. **Kalenderen:** den kommer med i samme omgang, men kun til læsning.

## Fordele

- Det er den måde, Home Assistant er bygget til. Indbyggede sætninger, AI-agenter, To-do-kortet, telefonappen og `todo.*`/`calendar.*` i automationer virker uden ekstra arbejde.
- Der er ingen egne sætninger at vedligeholde og ingen afhængighed af "Foretræk at håndtere kommandoer lokalt".
- Afkrydsning i butikken via Home Assistant-appen slår straks igennem i Madplan og omvendt.
- Kalenderen giver nye muligheder: "start madlavning"-påmindelser og madplanen i Home Assistants kalendervisning.

## Ulemper og risici

- **To dele, der skal passe sammen:** API'et skal være bagudkompatibelt, og der skal være en Repairs-meddelelse ved utakt.
- **Python i projektet:** nyt sprog, nyt testværktøj og et nyt CI-job.
- **Automatisk installation skriver i `custom_components`** og kræver en genstart. Der kan slås fra med `ha_integration`, og markøren beskytter brugerens egen udgave.
- **Listen er ikke en almindelig todo:** madplanens varer kan ikke omdøbes eller slettes rigtigt. Det skal vises tydeligt.
- **Home Assistants Python-API kan ændre sig.** Todo og kalender har været stabile længe, men integrationen skal testes mod nye versioner af Home Assistant.
- **Navnekonflikt:** har brugeren også Home Assistants egen "Indkøbsliste", skal en af dem have et andet navn eller alias. Det skal stå i DOCS.md.

## Uden for denne plan

- Flytte `sensor.madplan_*` ind i integrationen som rigtige entiteter under én enhed. Det giver pænere entiteter, men entity-id'erne skal bevares, fordi dashboards og automationer bruger dem. Det er en senere fase.
- At kunne planlægge en ret ved at oprette en begivenhed i kalenderen (`CREATE_EVENT`).
- Udgivelse via HACS.
