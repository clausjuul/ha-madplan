# Nice to have

Idéer, vi kan tage op senere. Hvert punkt siger, hvad der mangler i dag, og hvor i koden det hører hjemme.

## Planlæggeren (AI-ugeplan)

Nuværende kode: `server/src/ai/plan-ai.ts` (prompt og schema), `server/src/services/draft-plan.ts` (kontekst), `domain/src/planning.ts` (validering og udfyldning af huller).

Anbefalet rækkefølge: 1, 7, 9 og 2 først. De bruger kun data, vi allerede har. Derefter 3 og så 8.

### Mere kontekst

1. **Nabodagene med navn og kategori.** Låste og beholdte dage sendes kun som datoer/id'er (`lockedDays`, `preservedDates`), og den seneste uges måltider er ikke med. Modellen kan derfor ikke overholde "ikke samme kategori to dage i træk" over ugeskiftet eller omkring låste dage. Send fx de 7 dage før planen plus de låste dage med `name` og `category`.
2. **Familiens rytme.** Regn faste mønstre ud fra historikken (fx "fredag er ofte pizza/takeaway", "søndag tager gerne længere tid") og send dem som bløde ønsker pr. ugedag. Kan regnes lokalt i domain ud fra `eatenHistory`.
3. **Kalenderen i Home Assistant.** Læs de valgte kalendere via Supervisor (`/core/api/calendars/<entity>`):
   - optaget aften: hurtig ret (lav `maxPrepMinutes` for dagen)
   - gæster: flere portioner
   - bortrejst: dagen springes over

   Kræver en ny indstilling til valg af kalender(e).
4. **Vejret.** Prognosen fra en vejrentitet (`weather.get_forecasts`): grill ved varmt vejr, suppe/gryde ved koldt. Blødt ønske pr. dag.
5. **Pris og basisvarer.** Send rettens anslåede pris (`relativeRecipeCost` / pricing) og basisvarerne (`pantry`) med, i hvert fald når der er budget på.
6. **Rester og fryser.** `leftoverFriendly` sendes med, men der er ingen regel om at planlægge "lasagne søndag, rester mandag" eller dage med frysermad (`freezerFriendly`). Det kunne være en mulighed i guiden.

### Bedre proces

7. **Selvkorrektion.** I dag kasseres ugyldige forslag (`validateProposal`), og hullerne fyldes lokalt (`completePlan`). Giv modellen én chance til at rette sig med de afviste forslag og advarslerne fra `reviewPlan` (fx "kylling tre dage i træk"). Det er samme mønster som `correctionPrompt` i `server/src/ai/assist-ai.ts`.
8. **Rigtige nye retter.** "Antal nye retter" betyder i dag kun retter fra kataloget, I ikke har prøvet. Lad planlæggeren også vælge blandt gemte opskrifter (`savedInspirations`), den indbyggede inspiration (`domain/src/catalog/inspiration*.ts`) og ugens madplaner fra danske madsider (`server/src/weekly/`). De lægges i kataloget som `newDish`, når planen gemmes.
9. **Lær af "Lav om".** Når en ret byttes ud i et udkast, går signalet tabt. Gem det som et blødt minus (ligesom bedømmelserne i `ratingScores`), der falder væk med tiden.
10. **Modelvalg i indstillingerne.** Standarden er `gpt-4.1-mini` (`MADPLAN_PLAN_MODEL`). Gør det til en add-on-indstilling, så man kan vælge en stærkere model til ugeplanen.

### Familien

11. **Dage med god tid.** I dag gælder `maxPrepMinutes` og `budgetDkk` for hele ugen, og `dayRequests` er kun fritekst. Lad man markere enkelte dage (fx fredag og lørdag) som "god tid": en højere tidsgrænse, og retten må gerne koste lidt mere end ellers. Det kan være et felt pr. dag i `WeekPlanningSettingsV1`, fx `relaxedDates`, eller egne grænser pr. dato. Hænger sammen med 2 (rytme): "lørdag tager gerne længere tid" kan foreslås ud fra historikken.
12. **Byt én del af retten for én person.** Eksempel: de voksne får bøf med pebersauce, kartofler og broccoli. Sønnen vil ikke have bøf og får nuggets i stedet; resten af retten er den samme for ham.
    - Det er en mulighed, ikke en regel. Planlæggeren må bruge det, når en ret passer godt til de voksne, men en profil sandsynligvis ikke vil spise hovedelementet. Det passer især til dage med god tid (11), hvor man gerne vil lave noget lidt mere spændende.
    - **Profil:** en liste over "sikre valg" pr. profil (fx nuggets, fiskefrikadeller, pølser), dvs. det, personen altid spiser. Planlæggeren må kun bytte til noget derfra.
    - **Plan:** en dag kan have en eller flere varianter, fx `variants: [{ profileId, replaces: "bøf", with: "nuggets" }]`. Kun én del af retten byttes. Retten er stadig en og samme ret i planen og historikken.
    - **Indkøb:** byttet skal med på indkøbslisten: en portion bøf mindre og nuggets til én (`domain/src/portions.ts`, `domain/src/shopping.ts`).
    - **Visning:** dagskortet viser fx "Sønnen: nuggets i stedet for bøf".
    - **Assist:** "giv ham nuggets i stedet" tilføjer en variant til dagen.
    - **Grænser:** varianten skal overholde profilens `exclusions`. Der skal være en blød grænse for, hvor tit det sker, så det ikke ender med to retter hver dag.

## Assist

- **Tilbud.** Assist kender ikke ugens tilbud (Prej-nøglen bruges endnu ikke). Når tilbud findes, så send dem med i prompten.
- **Gem inspiration via Assist.** En handling, der gemmer en opskrift fra Opdag/ugeplaner, så man kan sige "gem den til senere".
- **Streaming gennem ingress.** Tjek i en rigtig installation, at `api/assist/stream` faktisk bliver sendt løbende gennem Home Assistants ingress og ikke holdes tilbage til sidst.

## Home Assistant

- **Eksponér sensorer for AI-agenter automatisk.** Stemme-automationerne oprettes af sig selv, men AI-samtaleagenter kræver stadig, at sensorerne vises for Assist manuelt. Undersøg, om det kan gøres via websocket (`homeassistant/expose_entity`).
- **Flere stemmekommandoer.** Fx "Hvad skal vi have på torsdag?" (med en ugedag som slot) og "Hvor lang tid tager aftensmaden?" (`prep_minutes`).
