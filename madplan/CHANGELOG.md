# Ændringer

## 0.24.0

- feat(dishes): add recipes from text and photos, AI fill, several at once
- feat(dishes): the app no longer ships built-in dishes

## 0.23.0

- feat(cook): the step shows how much of each ingredient it uses
- feat(import): dishes imported before the recipe check get it once

## 0.22.0

- feat(import): recipes are checked by AI before they are saved
- fix(shopping): imported recipes give a correct list (gr, ½, notes, pasta water)

## 0.21.1

- fix(server): app loads behind a kiosk app's proxy (blank page on Kiosk Satellite)
- fix(web): never leave a blank white page

## 0.21.0

- test(e2e): dish picker screenshot uses the new search placeholder
- feat(web): last UX polish from the review
- feat(assist): knows the week and day, can be stopped and retried, explains what it left out
- feat(web): shopping list – one toast per burst of ticks, Fortryd on removals
- feat(web): plan flow says what saving does and puts the big choice first
- feat(web): safer day changes and a smarter dish picker
- feat(web): cooking timers and step survive leaving cooking mode
- feat(web): clearer navigation – week context only where it belongs

## 0.20.1

- fix(ha): republish sensors after a Home Assistant restart; calendar named "Aftensmad"

## 0.20.0

- feat(ha): shopping list as a to-do list and meal plan as a calendar in Home Assistant
- docs(plans): Home Assistant integration with todo shopping list and meal calendar

## 0.19.0

- feat(settings): tabs and folded person cards
- feat(voice): add and remove shopping-list items from Home Assistant Assist

## 0.18.0

- feat(shopping): phone-first shopping list with "Hold skærmen tændt"

## 0.17.0

- feat(library): saved recipes show a clear "Fjern" button instead of "Gemt"
- fix(library): dish cards without a photo fill their grid cell
- feat(shopping): show offers as a tab next to the list
- feat(planning): neighbour days, weekday rhythm, self-correction and learning from "Lav om"

## 0.16.0

- feat(web): follow the Home Assistant theme

## 0.15.0

- fix(assist): leave archived dishes out of the prompt
- feat(assist): edit dishes, several days, shopping, basisvarer, settings and family

## 0.14.0

- feat(assist): find and add photos to dishes
- fix(offers): treat multi-buys as an extra deal on top of the single price

## 0.13.0

- feat(offers): Tilbudsvagt - watch items and exact products for offers

## 0.12.1

- test(demo): always have an eaten meal yesterday in the demo week
- fix(planning): drop the 14-day repeat warning from the plan review

## 0.12.0

- feat(offers): browse the fetched offers with sorting and filters, and settings on phones

## 0.11.0

- test(e2e): plan from a Monday so the integration test does not cross into the next week
- docs: nice-to-have list for the planner, Assist and Home Assistant
- feat(offers): weekly offers from Prej in the shopping list, planner, Assist and Home Assistant
- feat(planning): days with plenty of time and swapping one part of a dish for one person

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
