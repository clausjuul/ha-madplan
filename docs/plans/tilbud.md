# Plan: tilbud fra Prej (Netto og REMA 1000)

Status: bygget (fase 1-4) på grenen `feat/offers`. Ikke med: "Lav om"-alternativerne i browseren bruger endnu ikke tilbud. Skrevet 2026-11-14 ud fra Prejs offentlige dokumentation ([API](https://prej.dk/api), [dokumentation](https://prej.dk/api/dokumentation), [OpenAPI](https://api.prej.app/openapi.json)).

## Mål

Vise og bruge ugens tilbud i Madplan uden at bruge mere end gratis-nøglens **25 kald om dagen**:

- **Indkøbslisten** viser tilbudspris og butik på de varer, der er på tilbud, og hvilken butik der er billigst samlet.
- **Planlæggeren** foretrækker retter, hvor hovedingredienserne er på tilbud, og skriver det i begrundelsen ("hakket oksekød på tilbud i Netto").
- **Assist** kan svare på "hvad er på tilbud, vi kan bruge?" og foreslå retter ud fra det.

## Det vigtigste fra Prejs API

- Base-URL `https://api.prej.app`, header `Authorization: Bearer prej_...`.
- `GET /v1/offers?chain=netto&limit=100&page=N` giver dagens tilbud for én kæde. Højst 100 pr. side, og hver side er ét kald. Svaret indeholder `offers`, `total`, `page`, `limit` og `as_of`.
- Felter pr. tilbud:
  - `product_id`, `name`, `brand`, `chain_slug`
  - `price` og `normal_price` i øre
  - `quantity_label`, `unit_price`
  - `offer_starts`, `offer_ends`, `source` (`scraped`/`flyer`)
  - `multi_buy` (`quantity`, `price`, `price_each`)
- Kædernes slugs er `netto` og `rema1000`. De matcher vores `GroceryStore` direkte.
- Prej opdaterer data **én gang i døgnet om natten**. Kvoten nulstilles ved midnat UTC (kl. 01 dansk vintertid, kl. 02 sommertid). Hyppigere hentning giver altså ingen nye data.
- Hvert svar har headerne `X-RateLimit-Limit-Day` og `X-RateLimit-Remaining-Day`. Ved brugt kvote kommer 429 med `scope: "daily"` og `reset_at`. Svarene caches hos Prej, men tæller alligevel.
- Vilkår: gratis-nøglen må bruges til hobbyprojekter, ikke kommercielle produkter. Hver bruger lægger sin egen nøgle ind, og vi distribuerer aldrig en nøgle.

## Kaldbudget

| Hvad | Hvor tit | Kald |
| --- | --- | --- |
| Tilbud for Netto (alle sider) | 1 gang i døgnet | ca. 2–5 |
| Tilbud for REMA 1000 (alle sider) | 1 gang i døgnet | ca. 2–5 |
| Hent igen manuelt (knap) | sjældent | samme som ovenfor |
| **I alt en normal dag** | | **ca. 4–10 af 25** |

Antallet af sider afhænger af, hvor mange tilbud kæderne har. Det kender vi først efter første hentning (`total`), så det måles og logges. Hentes der kun mad-kategorier (`category=...`), bliver det færre sider, men det kræver et kald til `/v1/categories` for at kende slugs. Det skal kun ske én gang og gemmes.

**Krav (fra Claus):** det skal bare virke, og Madplan må aldrig bruge mere end 25 kald på et døgn. Derfor hentes der én gang om dagen, og der er ingen ugentlig planlægning efter avisdage. Det er det enkleste, og ubrugte kald forsvinder alligevel ved nulstillingen hver nat. Loftet er hårdt og tælles i Madplan selv, ikke kun ud fra Prejs headers.

**Regler i koden:**
- Madplan bruger højst **20 kald pr. døgn** og holder 5 i reserve, så nøglen kan bruges til andet. Kaldene tælles pr. UTC-døgn i tabellen `offer_sync`, og et kald sendes aldrig, hvis tælleren har nået loftet. Det gælder også knappen "Hent tilbud nu".
- Stop, når `X-RateLimit-Remaining-Day` er 3 eller mindre.
- Ved 429 `daily` venter Madplan til `reset_at`. Ved `burst` venter den et minut og prøver én gang mere.
- Er hentningen afbrudt halvvejs, beholdes gårsdagens tilbud for den kæde, og fejlen vises i Indstillinger. Halve data blandes aldrig med gamle.
- Kun kæder i `preferredStores` hentes.

## Arkitektur

### 1. Klient og synkronisering (server)

- **`server/src/offers/prej.ts`**: en lille klient med `fetchOffers(chain)`, der løber siderne igennem. Den læser kvote-headerne og kaster en typed fejl ved 429/401. Den bruger `deps.fetch`, så tests kan bruge en fake.
- **`server/src/offers/sync.ts`**: den daglige hentning.
  - Kører ved opstart, hvis dagens data mangler. Ellers dagligt kl. 06:00 lokal tid, efter Prejs natlige opdatering og nulstillingen af kvoten. Midnatstimeren findes allerede i `publisher.ts` (`msUntilMidnightInZone`).
  - Den hentes én kæde ad gangen, og hver kæde gemmes i sin egen transaktion.
  - Til sidst sendes et `ChangeEvent` med et nyt topic, `offers`, så web og sensorer opdateres.
- **Database** (ny migration):
  - `retail_offers` med kolonnerne `chain`, `product_id`, `name`, `brand`, `price_ore`, `normal_price_ore`, `quantity_label`, `unit_price_ore`, `multi_buy` (json), `valid_from`, `valid_until`, `source` og `as_of`. Primærnøglen er (`chain`, `product_id`).
  - `offer_sync` med kolonnerne `chain`, `synced_at`, `as_of`, `count`, `calls`, `remaining` og `error`. Den bruges til statusvisningen og til at undgå dobbelt hentning.
- **Udløbne tilbud** (`valid_until < i dag`) filtreres fra ved læsning og slettes ved næste hentning.

### 2. Matchning af ingredienser og tilbud (domain)

Det er den svære del, og den skal være ren domænekode med mange tests.

- `matchOffers(ingredient, offers)` i `domain/src/offers.ts`.
  - Den genbruger `normalizeItem` og matchningen på ordgrænser fra planlægningen (`d738457`).
  - Alle betydende ord fra ingrediensen skal findes i tilbuddets navn. Det svarer til den eksisterende `matchMethod: "all-query-tokens"` på `RetailOffer`.
  - Eksempel: "400 g hakket oksekød" giver "hakket oksekød", som matcher "Hakket oksekød 8-12 % 500 g", men ikke "Oksekødsuppe".
- Mængder fjernes fra ingrediensen (der findes allerede ingrediens-parsing i `ingredients.ts`). Fyld- og mærkeord fra tilbuddet ignoreres.
- Ikke-mad (fx "opvasketabs") må aldrig matche. Brug Prejs kategori, hvis den gemmes, ellers en lille stopliste.
- Typen `RetailOffer` findes allerede. Den udvides med `productId`, `normalPriceOre` og `multiBuy`. Mappingen fra Prej er `price` → `amountOre`, `offer_starts`/`offer_ends` → `validFrom`/`validUntil` og `as_of` → `observed`.
- `compareBaskets` i `basket.ts` findes allerede og bruger netop bekræftede Prej-tilbud. Den skal bare have data.

### 3. Brug i appen

**Fase 2, indkøbslisten:**
- `createShoppingList` får tilbuddene med og sætter `offer`, `priceIsOffer` og `estimatedPrice` pr. vare. Felterne findes allerede.
- `ShoppingRow` viser fx "12,95 kr. i Netto (før 19,95)" og "2 for 30" ved `multi_buy`.
- `PriceSummary` viser "Billigst i dag: Netto (ca. 412 kr.), REMA 1000 (ca. 438 kr.)" ud fra `compareBaskets`. Varer uden kendt pris tælles som "ukendt", ikke 0.
- Teksten "Tilbud fra Prej" vises, så det er tydeligt, hvor tallene kommer fra.

**Fase 3, planlæggeren:**
- `PlanningContext` får `offers`, der matches mod rettenes ingredienser.
- Lokal planlægning (`completePlan`, `createLocalSuggestions`) får et blødt plus pr. ingrediens på tilbud. Plusset er større, når besparelsen (`normal_price - price`) er stor, og når tilbuddet udløber inden for planperioden.
- AI-prompten (`plan-ai.ts`) får pr. ret en liste `onOffer: [{ ingredient, store, price, savedKr, ends }]`. Regel: tilbud er bløde, og de må aldrig vægte over fravalg og bedømmelser.
- Dagens `offer: OfferReference` udfyldes, så begrundelsen og indkøbslisten hænger sammen. `OfferReference` findes allerede på måltider og kladder.
- Reglen om ikke at opfinde tilbud ("Giv aldrig garanti for butikstilbud ... uden verificerede data") ændres til: brug kun tilbud fra DATA.

**Fase 4, Assist og Home Assistant:**
- Assist-prompten får en blok med tilbud, der matcher retter i kataloget eller planen. Det er højst ca. 60 linjer, så prompten ikke vokser. Reglen "du kender ikke ugens tilbud" fjernes, når der er data.
- Fritekst som "hvad er på tilbud i Netto?" kræver ingen nye kald, fordi alt læses fra databasen.
- Valgfrit: sensoren `sensor.madplan_tilbud` med antal relevante tilbud og en `items`-attribut. Den kan bruges til en stemmekommando ("hvad er på tilbud?") og en notifikation om lørdagen ved ny tilbudsavis.

### 4. Indstillinger og status

`StoresSection` erstatter "ikke med i denne version endnu" med en status:
- "Tilbud hentet i dag kl. 06:02 · Netto 187, REMA 1000 143 · 8 af 25 kald brugt i dag"
- Ved fejl: "Nøglen blev afvist (401)" eller "Dagens kvote er brugt; prøver igen efter kl. 01".

Der kommer også en knap, **Hent tilbud nu**. Den er slået fra, hvis dagens data allerede er hentet, eller hvis der er under 10 kald tilbage. Status kommer fra et nyt endpoint, `GET api/offers/status`.

## API i Madplan

- `GET api/offers?chain=&q=` giver de gemte tilbud. Det koster aldrig et Prej-kald.
- `GET api/offers/status` giver synkroniseringsstatus pr. kæde og kald brugt i dag.
- `POST api/offers/refresh` henter manuelt med kaldbudgettet ovenfor. Svaret er 409, hvis dagens data allerede er hentet, og 429, hvis budgettet er brugt.

## Tests

- **Klient:** sider løbes igennem, kvote-headerne læses, 429 `daily`/`burst` og 401 håndteres. Tests bruger fake fetch, ligesom `server/test/voice.test.ts`.
- **Synkronisering:** der hentes aldrig to gange samme dag, budgettet på 20 overholdes, og en fejl halvvejs beholder gårsdagens data.
- **Kaldloft:** en test med mange tilbud (fx 30 sider pr. kæde), genstarter og gentagne tryk på "Hent tilbud nu" viser, at tælleren aldrig når over 20 på et UTC-døgn.
- **Matchning:** en tabel med rigtige danske ingredienser og tilbudsnavne (mindst 40 par), både dem der skal og ikke skal matche.
- **Indkøbslisten:** tilbudspris og butik på varen. `compareBaskets` regner med ukendte varer.
- **Planlæggeren:** en ret med en ingrediens på tilbud vinder ved ellers lige vilkår, men aldrig over et fravalg.

## Rækkefølge

1. **Fase 1:** klient, synkronisering, tabeller og status i Indstillinger. Der vises ingen tilbud endnu, men vi måler `total` og kaldforbruget i en uge.
2. **Fase 2:** matchning og indkøbslisten med billigste butik.
3. **Fase 3:** planlæggeren (lokal og AI).
4. **Fase 4:** Assist, sensor og stemmekommando.

## Åbne spørgsmål

- Hvor mange tilbud har Netto og REMA 1000 typisk (`total`)? Det afgør antallet af sider og kald. Måles i fase 1.
- Tæller hver side som ét kald? Dokumentationen antyder det. Verificeres med `X-RateLimit-Remaining-Day` før og efter.
- Hvilke kategori-slugs dækker mad, så vi kan filtrere ikke-mad fra og spare sider? Afgøres ved ét kald til `/v1/categories`.
- Må tilbudsdata gemmes lokalt i et døgn? Det er normalt for en API-klient, men tjek [API-vilkårene](https://prej.dk/vilkaar-api) før fase 1.
- Skal vi understøtte flere kæder end Netto og REMA 1000 (fx Lidl, Føtex)? Det er let teknisk, men koster flere kald. Med gratis-nøglen giver 2–3 kæder mening.
