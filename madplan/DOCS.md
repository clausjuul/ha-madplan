# Madplan

Madplan er familiens madplan i Home Assistant: planlæg aftensmaden dag for dag, få en indkøbsliste ud fra planen, hold styr på køleskab og basisvarer, og lav mad trin for trin i en skærm med store knapper og timere.

## Det kan appen

- **Uge:** overblik over ugens aftensmad, "I aften" øverst, byt dage, lås dage, skriv noter, og spring dage over.
- **Indkøb:** indkøbslisten bygges automatisk ud fra ugens retter, minus basisvarer og det, I har i køleskabet. Tilføj egne varer, afkryds i butikken, og se et prisoverslag.
- **Retter:** jeres egne retter med opskrift, billede og historik. Importér en opskrift fra et link, eller opret den selv.
- **Opdag:** inspiration fra en samling af kendte retter. Med en OpenAI-nøgle kan appen også finde nye opskrifter på nettet fra godkendte opskriftssider.
- **Planlæg:** en guide, der laver et forslag til flere dage ad gangen. "Hurtigt forslag" vælger blandt jeres egne retter uden AI. "Assist" (kræver OpenAI) kan også finde nye retter. Du ser forslaget igennem, låser det, du kan lide, og gemmer. **Lav om** viser de tre bedste alternativer til dagen med en kort begrundelse. Varer i køleskabet, der snart udløber, prioriteres højt.
- **Kogetilstand:** fuldskærm med ingredienser, trin, timere og skærmen tændt, mens du laver mad.
- **Assist:** en samtale, der kan svare og foreslå ændringer ("byt torsdag ud med noget vegetarisk"). Assist ændrer aldrig noget af sig selv: du skal selv trykke **Udfør**.
- **Familie:** kostønsker, fravalg og præferencer pr. person tages med i alle forslag.
- **Bedømmelser:** dagen efter spørger ugen "Hvordan var ...?". *Godt* og *Mindre godt* påvirker fremtidige forslag, og *Ikke igen* får retten til ikke at blive foreslået igen.
- **Assist husker personer:** skriv f.eks. "Emma kan ikke lide svampe", så foreslår Assist at gemme det på Emmas profil.
- **Assist kender jeres historik:** den ser de sidste fire ugers måltider, jeres bedømmelser, noter, indkøbslisten og hvor længe siden I har spist hver ret. Skriv "vi elskede lasagnen i går", så foreslår den at gemme bedømmelsen. Den kan også skrive noter på en dag, markere en dag som "ikke spist" og fjerne ekstra varer fra indkøbslisten.
- **Assist-forslag:** du kan fjerne fluebenet ved enkelte handlinger, før du trykker **Udfør**, og trykke **Fortryd** i ti minutter bagefter (så længe intet andet er ændret i mellemtiden). Svaret skrives frem, mens Assist tænker, og Assist husker, hvilke af sine forslag du har udført eller afvist.

## Installation

1. Åbn **Indstillinger → Apps → App store**.
2. Tryk på **⋮** (øverst til højre) og vælg **Repositories**.
3. Tilføj `https://github.com/clausjuul/ha-madplan` og tryk **Tilføj**.
4. Find **Madplan** i app-butikken (opdatér siden, hvis den ikke dukker op), tryk **Installer**, og derefter **Start**.
5. Slå gerne **Vis i sidebjælken** til. Madplan åbner som et panel i Home Assistant.

## Konfiguration

Indstillingerne findes under appens fane **Konfiguration**. Begge er valgfri, og appen virker uden dem.

| Indstilling | Hvad den gør |
| --- | --- |
| `openai_api_key` | Slår AI til: Assist-samtalen, "Assist"-motoren i Planlæg og at finde nye opskrifter i Opdag. Du skal selv oprette en nøgle hos OpenAI. **Brug af OpenAI koster penge** og afregnes direkte mellem dig og OpenAI efter forbrug. Appen bruger kun nøglen, når du aktivt beder om et AI-svar. |
| `voice_commands` | Til som standard. Opretter stemmekommandoer til Home Assistants Assist (se "Spørg med stemmen"). |
| `prej_api_key` | Reserveret til tilbud fra Netto og REMA 1000. I version 0.1.0 registreres nøglen kun; tilbud vises endnu ikke. |

Efter ændring af konfigurationen skal appen genstartes.

Uden OpenAI kan du stadig bruge alt andet. Hvis Home Assistant har en samtaleagent (Assist-pipeline) slået til, kan Assist-samtalen i Madplan bruge den til at svare på spørgsmål (den kan så ikke foreslå ændringer).

## Første start

Madplan starter med et bibliotek af almindelige retter, så du kan komme i gang med det samme:

1. Åbn **Indstillinger** (tandhjulet) og tilføj familiens medlemmer med kostønsker og fravalg.
2. Vælg jeres butikker.
3. Tryk **Planlæg** og lav et forslag til ugen.
4. Åbn **Indkøb**, når planen er gemt.

## Flyt data fra den gamle "Meal Planner (Development)"

1. I den gamle app/dashboardet: eksportér **JSON-sikkerhedskopien**.
2. Åbn Madplan → **Indstillinger → Data → Importér**.
3. Vælg filen, kontrollér forhåndsvisningen, og bekræft.

Importen virker kun i en **tom database**, så gør det, før du begynder at bruge Madplan. Står der allerede noget i Madplan, kan du ikke importere oven i det.

## Sensorer i Home Assistant

Madplan opretter tre sensorer, som holdes opdateret automatisk (også ved midnat, når dagen skifter):

| Sensor | Værdi | Attributter |
| --- | --- | --- |
| `sensor.madplan_i_aften` | Navnet på aftenens ret, eller "Ingen ret" | `date`, `dish_id`, `prep_minutes`, `entity_picture`, `note`, `tomorrow` (morgendagens ret) |
| `sensor.madplan_indkob` | Antal varer, der mangler at blive købt | `estimated_price_dkk`, `from`, `to`, `items` (de manglende varer, højst 60) |
| `sensor.madplan_kommende` | Antal planlagte retter de næste 14 dage | `days` (liste med `date`, `weekday`, `dish`, `dish_id`, `prep_minutes`, `picture`, `note`, `skipped`), `ingress_url` |

## Spørg med stemmen (Home Assistant Assist)

Sensorerne kan bruges af Home Assistants egen stemmeassistent, så "Hvad skal vi have i aften?" virker fra telefonen eller en højttaler.

**Med en AI-samtaleagent i Home Assistant** (f.eks. OpenAI- eller Google-integrationen): vis de tre Madplan-sensorer for Assist under **Indstillinger → Stemmeassistenter → Vis**. Så kan agenten selv læse aftenens ret, de kommende dage og indkøbslisten.

**Med den indbyggede agent** (uden AI) virker det af sig selv: Madplan opretter ved opstart tre automationer under **Indstillinger → Automationer**, der svarer på:

- "Hvad skal vi have i aften?" / "Hvad er der til aftensmad?"
- "Hvad skal vi have i morgen?"
- "Hvad mangler vi at købe?" / "Hvad står der på indkøbslisten?"

De hedder "Madplan: ..." og opdateres automatisk, når Madplan opdateres. Vil du selv rette i én, så slet linjen "Oprettet af Madplan" i dens beskrivelse; så lader Madplan den være. Slå **Stemmekommandoer** (`voice_commands`) fra i konfigurationen, så fjerner Madplan dem igen. Det kræver, at `automations.yaml` er inkluderet i `configuration.yaml`, hvilket er standard.

Stemmen kan kun læse. Ændringer laver du i Madplans egen Assist, hvor du altid selv trykker **Udfør**.

## Madplan-kort til dashboards

Appen installerer selv to dashboard-kort: filen lægges i `www/madplan/madplan-cards.js` i Home Assistants konfigurationsmappe (sammen med rettenes billeder) og tilføjes som ressource under **Indstillinger → Dashboards → Ressourcer**. Genindlæs browseren efter første start. Bruger du dashboards i YAML-tilstand, så tilføj ressourcen selv:

```yaml
lovelace:
  resources:
    - url: /local/madplan/madplan-cards.js
      type: module
```

Kortene findes i kortvælgeren under "Madplan".

### Kommende dages retter

```yaml
type: custom:madplan-upcoming-card
days: 7            # antal dage (højst 14)
title: Aftensmad   # tom tekst ("") skjuler overskriften
show_images: true
show_today: true   # false starter fra i morgen
hide_empty: false  # true skjuler dage uden ret
compact: false     # mindre rækker
layout: list       # list, eller tiles: billeder med teksten oven på
columns: 2         # kolonner med layout: tiles (1-4)
tile_height: 140   # billedhøjde i px med layout: tiles
aspect_ratio: 16:9 # billedformat (f.eks. 16:9, 4:3, 1); erstatter tile_height
font_size: 16      # skriftstørrelse for retternes navn i px (10-40)
```

### Hele appen i et kort

```yaml
type: custom:madplan-app-card
view: uge          # uge, indkob, retter, planlaeg eller indstillinger
height: 640px
```

Kortet viser Madplan-appen gennem Home Assistants ingress, ligesom i sidemenuen. Home Assistant tillader det kun for administratorer; andre brugere ser en besked i stedet.

### Kort på dashboardet

```yaml
type: entities
title: Madplan
entities:
  - entity: sensor.madplan_i_aften
    name: I aften
  - entity: sensor.madplan_indkob
    name: Skal købes
```

Eller et enkelt kort:

```yaml
type: tile
entity: sensor.madplan_i_aften
name: Aftensmad
icon: mdi:silverware-fork-knife
```

### Automation: besked kl. 16 om aftensmaden

```yaml
alias: Madplan - hvad skal vi have at spise
trigger:
  - platform: time
    at: "16:00:00"
condition:
  - condition: not
    conditions:
      - condition: state
        entity_id: sensor.madplan_i_aften
        state: "Ingen ret"
action:
  - service: notify.notify
    data:
      title: Aftensmad
      message: "I aften: {{ states('sensor.madplan_i_aften') }} ({{ state_attr('sensor.madplan_i_aften', 'prep_minutes') }} min.)"
```

Skift `notify.notify` til jeres egen notify-tjeneste, fx `notify.mobile_app_...`.

## Sikkerhedskopier

- Madplan tager automatisk en kopi af databasen hver dag og gemmer de **7 seneste** i `/data/backups` (inde i appen).
- Under **Indstillinger → Data** kan du også hente alt som en JSON-fil.
- Appens data indgår i Home Assistants egne sikkerhedskopier. **Tag også en fuld Home Assistant-backup**, så du kan gendanne alt, hvis lagringen går tabt.

## Privatliv

- Alle data (retter, planer, familie, indkøb) ligger lokalt i appens database i din Home Assistant. Der er ingen konto og ingen sky.
- Uden OpenAI-nøgle sendes **ingenting** ud af huset, ud over at du selv kan hente opskrifter fra et link, du indsætter, og at billeder kan hentes fra en adresse, du angiver.
- Med en OpenAI-nøgle sendes der ved et AI-svar følgende til OpenAI: din besked eller dit ønske, ugens planlagte retter, retkataloget (navne, kategorier og ingredienser for relevante retter), køleskabets indhold, fælles fravalg og familieprofilerne (navne, kostønsker, præferencer). Der sendes ikke andre persondata. Opdag-søgninger sendes med websøgning slået til. Dataene sendes med `store: false`. Læs OpenAIs egne vilkår for, hvordan de behandler data.
- Sensorerne sendes kun til din egen Home Assistant.

## Fejlfinding

- **Appen starter ikke / panelet er tomt:** åbn appens fane **Log**. Genstart appen, og kontrollér, at din Home Assistant er opdateret.
- **"Assist er ikke tilgængelig":** tilføj en `openai_api_key` i konfigurationen og genstart appen.
- **AI svarer fejl:** tjek, at nøglen er gyldig, har penge på kontoen, og at modellen er tilgængelig for din konto. Log viser fejlen.
- **Sensorerne mangler:** de oprettes, når appen kører med adgang til Home Assistant. Genstart appen og tjek **Udviklerværktøjer → Tilstande** for `sensor.madplan_`.
- **Forkert dato omkring midnat:** Madplan bruger Home Assistants tidszone. Tjek den under **Indstillinger → System → Generelt**.
- **Importen afvises:** databasen skal være tom. Hent først en JSON-eksport af jeres nuværende data, hvis I vil gemme dem.
- **Fejl, du ikke kan løse:** opret en sag på https://github.com/clausjuul/ha-madplan/issues og vedhæft relevante linjer fra loggen (uden API-nøgler).
