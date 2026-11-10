import { Bookmark, BookmarkCheck, Clock, ExternalLink, Plus } from "lucide-react";
import type { InspirationRecipe } from "@madplan/domain";
import { DishImage } from "@/components/ui/DishImage";
import { inspirationImageSrc } from "@/lib/images";

type Props = {
  recipe: InspirationRecipe;
  saved: boolean;
  isNew?: boolean;
  busy?: boolean;
  onToggleSave: () => void;
  onAdd: () => void;
};

/** Big photo card for one inspiration. */
export function InspirationCard({ recipe, saved, isNew, busy, onToggleSave, onAdd }: Props) {
  const imageUrl = inspirationImageSrc(recipe);
  return (
    <article className="flex flex-col overflow-hidden rounded-[28px] bg-surface">
      <div className="relative">
        <DishImage
          dish={{ name: recipe.name, category: recipe.cuisine, ...(imageUrl ? { imageUrl } : {}) }}
          width={520}
          height={300}
          decorative
          className="aspect-[16/10] w-full"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-full bg-ground/75 px-3 py-1.5 text-[13px] font-medium text-ink backdrop-blur">{recipe.cuisine}</span>
          {isNew ? <span className="rounded-full bg-new px-3 py-1.5 text-[13px] font-bold text-on-new">Ny</span> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display m-0 text-xl font-bold leading-tight">{recipe.name}</h3>
        <p className="m-0 flex items-center gap-1.5 text-sm text-muted">
          <Clock size={14} aria-hidden="true" />
          {recipe.prepMinutes} min
          {recipe.tags.length > 0 ? ` · ${recipe.tags.slice(0, 3).join(", ")}` : ""}
        </p>
        <p className="m-0 line-clamp-3 text-[15px] leading-relaxed text-ink-2">{recipe.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button type="button" disabled={busy} onClick={onAdd} className="flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent disabled:opacity-60">
            <Plus size={17} aria-hidden="true" />
            Tilføj til retter
          </button>
          <button type="button" onClick={onToggleSave} aria-pressed={saved} className="flex h-11 items-center gap-1.5 rounded-full border border-line px-4 text-[15px] font-semibold text-ink hover:bg-raised">
            {saved ? <BookmarkCheck size={17} className="text-accent" aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}
            {saved ? "Gemt" : "Gem til senere"}
          </button>
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Åbn kilde for ${recipe.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink"
          >
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}
