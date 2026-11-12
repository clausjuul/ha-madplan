# Ændringer

## 0.10.0

- feat(assist): proposal memory, strict schema, richer context, new actions, partial apply, undo, streaming and voice commands

## 0.9.0

- feat(planning): alternatives sheet for "Lav om" and meal ratings that steer suggestions
- feat(assist): updateProfile action to remember a person's likes, dislikes and exclusions
- feat(planning): weigh expiring fridge items, match on word edges, richer AI plan prompt with structured output

## 0.8.0

- feat(cards): aspect ratio and font size options for the upcoming-dishes card

## 0.7.0

- feat(cards): picture tiles with text overlay for the upcoming-dishes card

## 0.6.0

- feat(cards): visual editors for the Madplan dashboard cards

## 0.5.0

- feat: dashboard cards for upcoming dishes and the embedded app

## 0.4.0

- feat(web): "Gemt" tab for recipes saved for later

## 0.3.0

- ci: install Playwright's Chromium without apt dependencies
- fix(ci): keep package versions in step with the add-on version
- feat: weekly meal plans from Danish food sites
- refactor(web): use React Router for routing
- fix(web): Assist input on one row between mic and send
- fix(web): Assist input collapsed to a sliver

## 0.2.0

- ci: release automatically on every push to main
- feat(web): restyle Assist chat after Astryx chat components
- fix(server): mention json in input for json_object mode
- fix(web): add person works outside secure contexts

## 0.1.0

Første udgivelse.

- Uge: aftensmad for ugen med "I aften", byt, lås, noter og spring dage over. Fungerer på tablet og telefon.
- Indkøb: automatisk indkøbsliste ud fra planen, basisvarer, køleskab, egne varer, afkrydsning og prisoverslag.
- Retter: egne retter med opskrift, billede, historik, import fra link og arkivering.
- Opdag: inspiration fra en samling af retter; med OpenAI også nye opskrifter fra godkendte opskriftssider.
- Planlæg: guide til flere dage ad gangen med hurtigt forslag (egne retter) eller Assist (OpenAI), gennemgang, låsning og udskiftning før gemning.
- Kogetilstand: fuldskærm med ingredienser, trin, timere og skærm, der forbliver tændt.
- Assist: samtale, der foreslår ændringer, som først udføres, når du bekræfter. Forslag overlever en genstart.
- Familie: kostønsker, fravalg og præferencer pr. person.
- Sensorer: `sensor.madplan_i_aften` og `sensor.madplan_indkob`.
- Daglig sikkerhedskopi (7 dage), JSON-eksport og import fra den gamle Meal Planner.
- Live-opdatering mellem enheder, og tilgængelighed (WCAG AA) kontrolleret med axe.
