/**
 * The "Karten" panel on `/shopping` — the ONLY way into the wallet on a phone.
 *
 * `/shopping/cards` is not a tab (the tab bar is full and deliberately so, see
 * `components/layout/nav-items.ts`) and there is no sidebar below `lg`, so deleting
 * this panel would make the whole feature unreachable on the device it exists for.
 * Same rule as `GroupsCard` on `/settings`.
 *
 * It shows the saved cards as chips that open the till screen DIRECTLY, because
 * that is the actual journey: you are standing at the checkout with the shopping
 * list open and you need the Payback code now, not after two more taps. Managing
 * them is the secondary action.
 */
import { useState } from "react";
import { CreditCard } from "lucide-react";
import type { Card as CardEntity } from "@toon/shared";
import { Card, CardHeader, buttonClasses } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { AppLink } from "@/features/recipes/lib/nav";
import { CardDisplayDialog } from "./CardDisplayDialog";
import { useCards } from "../lib/queries";

/** How many chips fit before the row starts to look like a list. */
const MAX_CHIPS = 4;

export function CardsCard() {
  const t = useT();
  const cards = useCards();
  const [showing, setShowing] = useState<CardEntity | null>(null);

  // While the wallet is loading — or has failed, which offline is the normal case —
  // the panel still renders its link. An empty panel that says what it is for beats
  // one that vanishes, because vanishing hides the whole feature.
  const items = cards.data ?? [];

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader
        className="mb-0"
        title={
          <span className="flex items-center gap-2">
            <CreditCard aria-hidden="true" className="size-4 text-brand" />
            {t("cards.link.title")}
          </span>
        }
        description={t("cards.link.description")}
      />

      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.slice(0, MAX_CHIPS).map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => setShowing(card)}
                className="min-h-11 max-w-full truncate rounded-full border border-line bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {card.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-fg-muted">
          {items.length > 0 ? t("cards.count", { count: items.length }) : t("cards.empty.title")}
        </p>
        <AppLink
          to="/shopping/cards"
          className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
        >
          {t("cards.link.action")}
        </AppLink>
      </div>

      <CardDisplayDialog card={showing} onClose={() => setShowing(null)} />
    </Card>
  );
}
