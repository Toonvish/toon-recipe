/**
 * "Häufig gekauft" — the row of one-tap suggestions under the list.
 *
 * This is where a checked-off item goes. The server ranks entries by how often they
 * were actually BOUGHT (not merely typed), hides anything currently on the list, and
 * caps the row, so what shows up here is the group's real weekly shop.
 *
 * Chips rather than a second list: they must read as "things you could add", clearly
 * distinct from the large cards above, which are "things you still need". Each chip is
 * a >=44px target, and a long-press equivalent (the × on the chip) dismisses a
 * suggestion for good.
 */
import { Plus, X } from "lucide-react";
import type { ShoppingCatalogEntry } from "@toon/shared";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

export interface FrequentlyUsedProps {
  entries: ShoppingCatalogEntry[];
  onAdd: (entry: ShoppingCatalogEntry) => void;
  onDismiss: (entryId: string) => void;
  canMutate: boolean;
}

export function FrequentlyUsed({ entries, onAdd, onDismiss, canMutate }: FrequentlyUsedProps) {
  const t = useT();
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="frequently-used-heading" className="mt-6">
      <h2
        id="frequently-used-heading"
        className="mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase"
      >
        {t("shopping.frequentlyUsed.heading")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <button
              type="button"
              onClick={() => onAdd(entry)}
              disabled={!canMutate}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface py-2 pl-3 text-sm font-medium text-fg",
                "transition-colors duration-150 hover:bg-surface-2 active:scale-[0.97]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                "disabled:pointer-events-none disabled:opacity-55",
                canMutate ? "pr-9" : "pr-3",
              )}
            >
              <Plus aria-hidden="true" className="size-4 text-fg-muted" />
              <span className="max-w-[12rem] truncate">{entry.name}</span>
            </button>
            {canMutate ? (
              <button
                type="button"
                onClick={() => onDismiss(entry.id)}
                aria-label={t("shopping.frequentlyUsed.dismissAriaLabel", { name: entry.name })}
                title={t("shopping.frequentlyUsed.dismissTitle")}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-full text-fg-muted transition-colors duration-150 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
