# Ændringer

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
