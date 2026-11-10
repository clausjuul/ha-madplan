import { useMemo, useState, type FormEvent } from "react";
import { Info, Sparkles } from "lucide-react";
import {
  INSPIRATION_CUISINES,
  INSPIRATION_RECIPES,
  type BootstrapResponse,
  type InspirationCuisine,
  type InspirationRecipe,
} from "@madplan/domain";
import { useApi } from "@/api/provider";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { notify } from "@/lib/notify";
import { routeHref } from "@/lib/route";
import { InspirationCard } from "./InspirationCard";

type Cuisine = InspirationCuisine | "Alle";

const chip = (active: boolean): string =>
  `flex h-11 shrink-0 items-center rounded-full px-4 text-[15px] ${
    active ? "bg-ink font-semibold text-ground" : "bg-surface text-ink-2 hover:text-ink"
  }`;

const matches = (recipe: InspirationRecipe, text: string): boolean => {
  const needle = text.trim().toLocaleLowerCase("da-DK");
  if (!needle) return true;
  return [recipe.name, recipe.description, ...recipe.tags].some((part) => part.toLocaleLowerCase("da-DK").includes(needle));
};

export function Discover({ data }: { data: BootstrapResponse }) {
  const api = useApi();
  const actions = useDishActions();
  const [cuisine, setCuisine] = useState<Cuisine>("Alle");
  const [request, setRequest] = useState("");
  const [live, setLive] = useState<InspirationRecipe[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [adding, setAdding] = useState<string | undefined>();
  const openai = data.capabilities.openai;
  const saved = data.savedInspirations;
  const savedIds = useMemo(() => new Set(saved.map((recipe) => recipe.id)), [saved]);

  const catalog = useMemo(
    () =>
      INSPIRATION_RECIPES.filter(
        (recipe) => (cuisine === "Alle" || recipe.cuisine === cuisine) && (openai || matches(recipe, request)),
      ),
    [cuisine, request, openai],
  );

  const search = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSearching(true);
    setSearchError(undefined);
    try {
      setLive((await api.discover({ request: request.trim(), cuisine })).recipes);
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setSearching(false);
    }
  };

  const toggleSave = (recipe: InspirationRecipe): void => {
    const next = savedIds.has(recipe.id) ? saved.filter((item) => item.id !== recipe.id) : [...saved, recipe];
    actions.saveInspirations(next).catch((error: unknown) => notify(errorMessage(error)));
  };

  const add = (recipe: InspirationRecipe): void => {
    setAdding(recipe.id);
    actions
      .importInspiration(recipe)
      .then((dish) => {
        notify(`${dish.name} er tilføjet til dine retter.`);
        window.location.hash = routeHref({ name: "retter", dishId: dish.id });
      })
      .catch((error: unknown) => notify(errorMessage(error)))
      .finally(() => setAdding(undefined));
  };

  const grid = (recipes: readonly InspirationRecipe[], isNew = false) => (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <li key={recipe.id} className="flex flex-col">
          <InspirationCard recipe={recipe} saved={savedIds.has(recipe.id)} isNew={isNew} busy={adding === recipe.id} onToggleSave={() => toggleSave(recipe)} onAdd={() => add(recipe)} />
        </li>
      ))}
    </ul>
  );
  const heading = (text: string) => <h2 className="font-display mb-3 mt-1 text-xl font-bold">{text}</h2>;

  return (
    <div className="flex flex-col gap-5">
      {openai ? (
        <form onSubmit={(event) => void search(event)} className="flex flex-wrap gap-2.5">
          <label className="min-w-[240px] flex-1">
            <span className="sr-only">Hvad har I lyst til?</span>
            <input
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Hvad har I lyst til? Fx “noget med kylling og ingen chili”"
              className="h-12 w-full rounded-full border border-line bg-surface px-5 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          <button type="submit" disabled={searching} className="flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent disabled:opacity-60">
            <Sparkles size={18} aria-hidden="true" />
            {searching ? "Leder efter opskrifter…" : "Find forslag"}
          </button>
        </form>
      ) : (
        <div role="note" className="flex gap-3 rounded-3xl bg-surface p-4 text-[15px] leading-relaxed text-ink-2">
          <Info size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <p className="m-0">
            Her vises kun den indbyggede samling. Levende søgning efter nye opskrifter kræver en OpenAI API-nøgle i
            appens konfiguration i Home Assistant.
          </p>
        </div>
      )}
      {openai && __FAKE_API__ ? (
        <p className="m-0 text-sm text-offer">Demotilstand: søgeresultaterne er eksempler og ikke rigtige opskrifter.</p>
      ) : null}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Køkken">
        {(["Alle", ...INSPIRATION_CUISINES] as Cuisine[]).map((name) => (
          <button key={name} type="button" aria-pressed={cuisine === name} className={chip(cuisine === name)} onClick={() => setCuisine(name)}>
            {name}
          </button>
        ))}
      </div>
      {!openai ? (
        <label className="block">
          <span className="sr-only">Filtrér samlingen</span>
          <input
            type="search"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Filtrér samlingen (navn, beskrivelse, mærkat)"
            className="h-12 w-full rounded-full border border-line bg-surface px-5 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
      ) : null}

      {searchError ? (
        <p role="alert" className="m-0 rounded-2xl bg-offer-soft p-3 text-[15px] text-offer">
          {searchError}
        </p>
      ) : null}
      {live.length > 0 ? (
        <section>
          {heading("Nye forslag")}
          {grid(live, true)}
        </section>
      ) : null}
      {saved.length > 0 ? (
        <section>
          {heading(`Gemt til senere (${saved.length})`)}
          {grid(saved)}
        </section>
      ) : null}
      <section>
        {heading("Fra samlingen")}
        {catalog.length > 0 ? grid(catalog) : <p className="rounded-3xl bg-surface p-8 text-center text-[15px] text-ink-2">Ingen opskrifter matcher.</p>}
      </section>
    </div>
  );
}
