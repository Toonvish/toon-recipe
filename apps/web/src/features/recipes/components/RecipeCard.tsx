/**
 * Recipe card for the responsive grid on the list screen, from Tailwind's `sm` up.
 * Below that the list renders `RecipeRow` instead — see the note in that file.
 */
import { Clock, Star, UtensilsCrossed, Users } from "lucide-react";
import type { RecipeListItem } from "@toon/shared";
import { cn } from "@/lib/cn";
import { thumbnailUrl } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { TagChip } from "@/features/tags/components/TagChip";
import { AppLink } from "../lib/nav";
import { optionalMinutes, optionalServings } from "../lib/format";

export interface RecipeCardProps {
  recipe: RecipeListItem;
  className?: string;
}

const MAX_TAGS = 3;

export function RecipeCard({ recipe, className }: RecipeCardProps) {
  const t = useT();
  // The 480px derivative, not the original: a grid of full-size phone photos is
  // megabytes per screen. The card is ~360px at its widest breakpoint.
  const image = thumbnailUrl(recipe);
  const time = optionalMinutes(recipe.totalMinutes ?? recipe.cookMinutes ?? recipe.prepMinutes);
  const servings = optionalServings(recipe.servingsAmount, recipe.servingsUnit);
  const visibleTags = recipe.tags.slice(0, MAX_TAGS);
  const hiddenTagCount = recipe.tags.length - visibleTags.length;

  return (
    <AppLink
      to="/recipes/$recipeId"
      params={{ recipeId: recipe.id }}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface text-fg shadow-card",
        "transition-[transform,box-shadow,border-color] duration-150",
        "hover:border-line-strong hover:shadow-pop active:scale-[0.995]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-surface-2">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">
            <UtensilsCrossed aria-hidden="true" className="size-10" />
          </div>
        )}
        {typeof recipe.rating === "number" && recipe.rating > 0 ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-sm font-medium text-white backdrop-blur-sm">
            <Star aria-hidden="true" className="size-3.5 fill-current" />
            <span className="tabular-nums">{recipe.rating}</span>
            <span className="sr-only">{t("recipes.rating.outOfFive")}</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 font-display text-lg leading-tight font-semibold">
          {recipe.title}
        </h3>

        {recipe.description ? (
          <p className="line-clamp-2 text-sm text-fg-muted">{recipe.description}</p>
        ) : null}

        {time || servings ? (
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            {time ? (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden="true" className="size-4" />
                {time}
              </span>
            ) : null}
            {servings ? (
              <span className="inline-flex items-center gap-1">
                <Users aria-hidden="true" className="size-4" />
                {servings}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="mt-auto" />
        )}

        {visibleTags.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
              <li key={tag.id}>
                <TagChip tag={tag} size="sm" />
              </li>
            ))}
            {hiddenTagCount > 0 ? (
              <li className="self-center text-xs text-fg-subtle">+{hiddenTagCount}</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </AppLink>
  );
}
