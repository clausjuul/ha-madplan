# Ugens forslag – kilder (research 2026-11-11, uge 46)

| Kilde | Find ugens plan | Udtræk | robots.txt | Status |
|---|---|---|---|---|
| Valdemarsro | Fast URL `https://www.valdemarsro.dk/madplan/` ("Madplan uge NN") | 7 `<a>`-links til `/<slug>/` (man–søn) efter nav-links | OK (kun GPTBot blokeret) | ✅ Primær |
| Sund på budget | WP REST: `/wp-json/wp/v2/posts?search=madplan uge NN` → flere planer (sund, vegetarisk, flexitarisk, single) | "UGENS SUNDE MADPLAN"-blok: `Mandag: <ret>` … (tekst, ikke altid links) | OK | ✅ |
| Madens Verden | WP REST eller `https://madensverden.dk/ugens-madplan-uge-NN/` | `<h*>Mandag…Søndag` + "Ugens kage"; ret + link under hver | OK | ✅ |
| Hurtigmums | WP REST (generel, børnefamilie, vegetarisk; udgives onsdag for næste uge) | Ugeplan med retter + tid; JSON-LD med datePublished | OK | ✅ |
| One Kitchen | WP REST `onekitchenblog.com` (slug-suffix `-N` per år) | Ugeplan-indlæg | OK | ✅ |
| Maden i mit liv | WP REST `madenimitliv.dk` (ikke hver uge) | Kun for medlemmer af "Madklubben" | OK | ❌ Login |
| Noget i ovnen | WP REST `nogetiovnen.dk` | Ugeplan-indlæg | OK | ✅ |
| Anna-mad | WP REST, men seneste plan 2025 | – | – | ❌ Inaktiv |
| I FORM | `https://iform.dk/sunde-opskrifter/madplaner/madplan-uge-NN-YYYY` | Nuxt SSR; titel + teaser per ret (overskrifter) | ikke tjekket | 🟡 Mulig |
| Mad for Fattigrøve | `/madplaner/<id>` (løbende id, ikke uge) | Client-rendered (Mantine), plan-sider gav 404/tom HTML | ingen robots | ❌ Udskudt |
| Arla, Coop, nemlig, dk-kogebogen, Louises madblog | Ingen `/madplan/` (404, kø-system eller login) | – | – | ❌ |
| Facebook-grupper | Login + ToS | – | – | ❌ |

Noter
- Ingen af kildernes ugeoversigter har `schema.org/Recipe` JSON-LD; den findes først på selve opskriftssiden (bruges ved import).
- Uge-nummer valideres mod titel ("uge 46") + publiceringsdato, så vi ikke viser sidste års plan (Madens Verden genbruger slug `ugens-madplan-uge-46`).
