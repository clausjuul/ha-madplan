import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import type { ShoppingListItem } from "@madplan/domain";

type Props = {
  item: ShoppingListItem;
  onToggle: (itemId: string) => void;
  onRemove: (itemId: string) => void;
};

const SPRING = { type: "spring", stiffness: 520, damping: 40 } as const;

const forDish = (item: ShoppingListItem): string => (item.extra ? "Ekstra vare" : item.dishNames.join(" · "));

/** Row that is still to buy: one big tap target (>= 60px). */
export function OpenRow({ item, onToggle, onRemove }: Props) {
  return (
    <motion.li layout layoutId={`item-${item.id}`} transition={SPRING} className="flex items-center rounded-2xl bg-surface">
      <button
        type="button"
        aria-pressed={false}
        onClick={() => onToggle(item.id)}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3.5 rounded-2xl bg-transparent px-3.5 py-2 text-left text-ink"
      >
        <span aria-hidden="true" className="h-[26px] w-[26px] shrink-0 rounded-lg border-2 border-white/30" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[17px] font-medium first-letter:uppercase">{item.label}</span>
          <span className="truncate text-[13px] text-muted">{forDish(item)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[15px] text-ink-2">{item.quantityLabel}</span>
          <span className={`text-[13px] ${item.priceIsOffer ? "font-semibold text-offer" : "text-muted"}`}>
            {item.priceIsOffer ? `Tilbud ${item.priceLabel}${item.offer ? ` · ${item.offer.store}` : ""}` : item.priceLabel}
          </span>
        </span>
      </button>
      {item.extra ? <RemoveButton item={item} onRemove={onRemove} /> : null}
    </motion.li>
  );
}

/** Row already in the basket: quiet, struck through, tap to put back. */
export function DoneRow({ item, onToggle, onRemove }: Props) {
  return (
    <motion.li layout layoutId={`item-${item.id}`} transition={SPRING} className="flex items-center rounded-2xl">
      <button
        type="button"
        aria-pressed
        onClick={() => onToggle(item.id)}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3.5 rounded-2xl bg-transparent px-3.5 py-1.5 text-left text-muted"
      >
        <span
          aria-hidden="true"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent"
        >
          <Check size={16} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1 truncate text-base line-through first-letter:uppercase">{item.label}</span>
        <span className="shrink-0 text-sm">{item.quantityLabel}</span>
      </button>
      {item.extra ? <RemoveButton item={item} onRemove={onRemove} /> : null}
    </motion.li>
  );
}

function RemoveButton({ item, onRemove }: Pick<Props, "item" | "onRemove">) {
  return (
    <button
      type="button"
      aria-label={`Fjern ${item.label}`}
      onClick={() => onRemove(item.id)}
      className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted hover:text-ink"
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}
