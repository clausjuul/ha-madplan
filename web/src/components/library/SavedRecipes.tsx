import { Link } from "react-router";
import type { BootstrapResponse } from "@madplan/domain";
import { routePath } from "@/lib/route";
import { InspirationCard } from "./InspirationCard";
import { useInspirationActions } from "./use-inspiration-actions";

/** Recipes saved for later from "Opdag nyt" and "Ugeplaner". */
export function SavedRecipes({ data }: { data: BootstrapResponse }) {
  const saved = data.savedInspirations;
  const { savedIds, adding, toggleSave, add } = useInspirationActions(saved);

  if (saved.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-10 text-center text-[15px] text-ink-2">
        <p className="m-0 mb-3">Du har ikke gemt nogen retter endnu.</p>
        <p className="m-0">
          Tryk “Gem til senere” under{" "}
          <Link to={routePath({ name: "retter", tab: "opdag" })} className="text-accent underline">Opdag nyt</Link> eller{" "}
          <Link to={routePath({ name: "retter", tab: "ugens" })} className="text-accent underline">Ugeplaner</Link>.
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {[...saved].reverse().map((recipe) => (
        <li key={recipe.id} className="flex flex-col">
          <InspirationCard
            recipe={recipe}
            badge={recipe.cuisine === "International" ? recipe.sourceName : recipe.cuisine}
            saved={savedIds.has(recipe.id)}
            busy={adding === recipe.id}
            onToggleSave={() => toggleSave(recipe)}
            onAdd={() => add(recipe)}
          />
        </li>
      ))}
    </ul>
  );
}
