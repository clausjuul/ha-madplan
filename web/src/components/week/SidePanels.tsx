import { Link } from "react-router";
import { ShoppingCart } from "lucide-react";
import { formatPrice, type FridgeItem, type ShoppingList } from "@madplan/domain";
import { shoppingUntilLabel, useFirstItems } from "@/lib/week-model";

export function ShoppingSummary({ list }: { list: ShoppingList | undefined }) {
  const count = list ? list.items.length - list.checkedCount : 0;
  return (
    <Link
      to="/indkob"
      className="flex min-h-[132px] flex-1 flex-col gap-1.5 rounded-3xl bg-surface px-[22px] py-5 text-ink no-underline"
    >
      <span className="flex items-center gap-2 text-sm text-muted">
        <ShoppingCart size={18} aria-hidden="true" />
        Næste indkøb{list ? ` · ${shoppingUntilLabel(list.to)}` : ""}
      </span>
      {list ? (
        <>
          <strong className="font-display text-[34px] font-bold leading-[1.1]">
            {count === 1 ? "1 vare" : `${count} varer`}
          </strong>
          <span className="text-[15px] text-ink-2">
            {list.totalEstimatedPrice > 0 ? `ca. ${formatPrice(list.totalEstimatedPrice)}` : "Ingen pris endnu"}
            {list.offerItemCount > 0 ? (
              <>
                {" · "}
                <span className="text-offer">
                  {list.offerItemCount === 1 ? "1 tilbud" : `${list.offerItemCount} tilbud`}
                </span>
              </>
            ) : null}
          </span>
        </>
      ) : (
        <span className="skeleton mt-1 h-10 w-32 rounded-xl" aria-hidden="true" />
      )}
      <span className="flex-1" />
      <span className="text-[15px] font-semibold text-accent">Åbn indkøbslisten →</span>
    </Link>
  );
}

export function UseFirst({ fridge, today }: { fridge: readonly FridgeItem[]; today: string }) {
  const items = useFirstItems(fridge, today);
  return (
    <section aria-label="Brug først" className="flex flex-col gap-2.5 rounded-3xl bg-surface px-[22px] py-[18px]">
      <span className="text-sm text-muted">Brug først fra køleskabet</span>
      {items.length === 0 ? (
        <span className="text-[15px] text-ink-2">Intet haster i køleskabet.</span>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map((item) => (
            <li
              key={item.name}
              className={`rounded-full px-3 py-1.5 text-sm ${
                item.urgent ? "bg-offer-soft text-offer" : "bg-raised text-ink-2"
              }`}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
