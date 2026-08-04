/**
 * Compact recipe row — the list layout below Tailwind's `sm`.
 *
 * WHY IT EXISTS. `RecipeCard` leads with a 4:3 hero image, so on a 390 px phone one
 * recipe was ~380 px tall: a full screen per recipe, and scrolling to the fifth one
 * took four flicks. A row is ~76 px, so a phone shows eight at once — which is what
 * a list is for. The card grid takes over from `sm`, where the extra width exists.
 *
 * Deliberately NOT here: the description and the tag chips. They are the two things
 * that make the card tall, and neither helps to pick a recipe out of a list of
 * titles. Matches the row on the collection detail screen (same thumbnail size).
 */
import { ChevronRight, Clock, Star, UtensilsCrossed } from "lucide-react";
import type { RecipeListItem } from "@toon/shared";
import { cn } from "@/lib/cn";
import { thumbnailUrl } from "@/lib/api";
import { AppLink } from "../lib/nav";
import { optionalMinutes } from "../lib/format";

export interface RecipeRowProps {
  recipe: RecipeListItem;
  className?: string;
}

export function RecipeRow({ recipe, className }: RecipeRowProps) {
  const image = thumbnailUrl(recipe);
  const time = optionalMinutes(recipe.totalMinutes ?? recipe.cookMinutes ?? recipe.prepMinutes);
  const rating = typeof recipe.rating === "number" && recipe.rating > 0 ? recipe.rating : null;

  return (
    <AppLink
      to="/recipes/$recipeId"
      params={{ recipeId: recipe.id }}
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface p-2 text-fg shadow-card",
        "transition-[background-color,border-color] duration-150",
        "hover:border-line-strong hover:bg-surface-2 active:scale-[0.995]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-16 shrink-0 rounded-xl bg-surface-2 object-cover"
        />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-subtle">
          <UtensilsCrossed aria-hidden="true" className="size-6" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-medium leading-snug">{recipe.title}</h3>
        {/*
          ONE line, never wrapping: measured on a 390px phone, time + Portionen + rating
          needed a second line and the row grew from 76px to 104px, which is most of what
          the compact layout won back. Portionen is the one that goes — the detail screen
          has it, and it is the least useful thing to scan a list by.
        */}
        {time || rating !== null ? (
          <p className="mt-0.5 flex items-center gap-x-3 overflow-hidden text-sm text-fg-muted">
            {time ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Clock aria-hidden="true" className="size-3.5" />
                {time}
              </span>
            ) : null}
            {rating !== null ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Star aria-hidden="true" className="size-3.5 fill-current text-warning" />
                <span className="tabular-nums">{rating}</span>
                <span className="sr-only">von 5 Sternen</span>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-subtle" />
    </AppLink>
  );
}
