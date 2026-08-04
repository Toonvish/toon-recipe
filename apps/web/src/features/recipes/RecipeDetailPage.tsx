/**
 * RecipeDetailPage.
 *
 * Hero image, meta row (Portionen / Arbeitszeit / Backzeit / Gesamt), tags, ingredients
 * and steps grouped by section, notes, source attribution.
 *
 * Key interactions:
 *  - SERVINGS SCALER: rescales every quantity live with `scaleIngredients` from
 *    @toon/shared (the exact function the API's /scale endpoint uses) and renders nice
 *    fractions via `formatQuantity`.
 *  - COOK MODE: full-screen, large-type step-by-step view with a screen wake lock.
 *  - Actions live in ONE overflow `ActionMenu` next to the title — bearbeiten, teilen
 *    (navigator.share + clipboard fallback), kopieren, drucken (print.css), duplizieren,
 *    löschen (ConfirmDialog). Kochmodus and "Zur Einkaufsliste" stay visible where they
 *    belong instead: at the steps heading and under the ingredients.
 */
import { useMemo, useState } from "react";
import {
  ChefHat,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  ListChecks,
  Pencil,
  Printer,
  RotateCcw,
  Share2,
  ShoppingBasket,
  Star,
  Timer,
  Trash2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { scaleIngredients, type RecipeDetail } from "@toon/shared";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  LoadingBlock,
  buttonClasses,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { mediaUrl } from "@/lib/api";
import { difficultyLabels, formatRelative, hostFromUrl, safeHttpUrl } from "@/lib/format";
import { useActiveGroup, useCurrentUser, useSession } from "@/lib/session";
import { TagChip } from "@/features/tags/components/TagChip";
import "./print.css";
import { AppLink, useAppNavigate, useRouteParam } from "./lib/nav";
import { canModifyOwn } from "./lib/permissions";
import { copyToClipboard, shareOrCopy, useCheckedSteps } from "./lib/hooks";
import { optionalMinutes, optionalServings, recipeToPlainText } from "./lib/format";
import {
  duplicatePayload,
  useCreateRecipe,
  useDeleteRecipe,
  useRecipe,
} from "./lib/queries";
import { IngredientList } from "./components/IngredientList";
import { StepList } from "./components/StepList";
import { ServingsScaler } from "./components/ServingsScaler";
import { CookMode } from "./components/CookMode";
import { AddRecipeToListDialog } from "@/features/shopping/components/AddRecipeToListDialog";
import {
  useAddRecipeToShoppingList,
  useCreateShoppingList,
  useShoppingLists,
} from "@/features/shopping/lib/queries";

export default function RecipeDetailPage() {
  const recipeId = useRouteParam("recipeId");
  const { groupId, role } = useActiveGroup();
  const { isOnline } = useSession();
  const user = useCurrentUser();
  const navigate = useAppNavigate();
  const toast = useToast();

  const query = useRecipe(groupId, recipeId);
  const loaded = query.data;

  const deleteRecipe = useDeleteRecipe(groupId);
  const createRecipe = useCreateRecipe(groupId);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(false);

  // Loaded up front so the button can say whether there is a list to add to at all.
  const shoppingLists = useShoppingLists(groupId);
  const addToShoppingList = useAddRecipeToShoppingList();
  // A group with no list at all would make "Zur Einkaufsliste" a dead end, so the
  // dialog can create the first one.
  const createShoppingList = useCreateShoppingList(groupId);

  const checked = useCheckedSteps(recipeId);

  const baseServings =
    typeof loaded?.servingsAmount === "number" && loaded.servingsAmount > 0
      ? loaded.servingsAmount
      : null;
  const servings = servingsOverride ?? baseServings ?? 1;
  const factor = baseServings ? servings / baseServings : 1;

  /**
   * Local scaling: `scaleIngredients` throws RangeError for factor <= 0, which the
   * stepper can never produce (it clamps at 0.5), but guard anyway.
   */
  const scaledIngredients = useMemo(() => {
    if (!loaded) return [];
    if (!baseServings || Math.abs(factor - 1) < 0.0001) return loaded.ingredients;
    try {
      return scaleIngredients(loaded.ingredients, factor, { keepNonScalingUnits: true });
    } catch {
      return loaded.ingredients;
    }
  }, [loaded, baseServings, factor]);

  if (query.isPending) return <LoadingBlock label="Rezept wird geladen …" />;

  if (query.isError || !loaded) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <AppLink to="/" className={buttonClasses({ variant: "secondary" })}>
            Zur Rezeptliste
          </AppLink>
        }
      />
    );
  }

  // Non-optional alias so the async callbacks below close over a narrowed value.
  const recipe: RecipeDetail = loaded;

  const canEdit = canModifyOwn(role, user.id, recipe.createdBy);
  const image = mediaUrl(recipe.imageUrl);
  const host = hostFromUrl(recipe.sourceUrl);
  // Never render a server-supplied link straight into an href — see safeHttpUrl.
  const sourceHref = safeHttpUrl(recipe.sourceUrl);
  const scaled = Math.abs(factor - 1) > 0.0001;

  const plainText = () =>
    recipeToPlainText({
      title: recipe.title,
      description: recipe.description,
      servingsAmount: servings,
      servingsUnit: recipe.servingsUnit,
      totalMinutes: recipe.totalMinutes,
      ingredients: scaledIngredients,
      steps: recipe.steps,
      notes: recipe.notes,
      sourceUrl: recipe.sourceUrl,
    });

  async function share() {
    const result = await shareOrCopy({
      title: recipe.title,
      text: plainText(),
      url: window.location.href,
    });
    if (result === "copied") toast.success("In die Zwischenablage kopiert");
    else if (result === "unavailable") toast.error("Teilen nicht möglich");
  }

  async function copyIngredients() {
    const lines = plainText();
    const ok = await copyToClipboard(lines);
    if (ok) toast.success("Rezept kopiert", scaled ? `Skaliert auf ${servings}` : undefined);
    else toast.error("Kopieren nicht möglich");
  }

  async function duplicate() {
    try {
      const copy = await createRecipe.mutateAsync(duplicatePayload(recipe));
      toast.success("Kopie angelegt", copy.title);
      navigate({ to: "/recipes/$recipeId", params: { recipeId: copy.id } });
    } catch (error) {
      toast.fromError(error, "Duplizieren fehlgeschlagen");
    }
  }

  const metaItems: Array<{ icon: typeof Clock; label: string; value: string }> = [];
  const servingsLabel = optionalServings(recipe.servingsAmount, recipe.servingsUnit);
  if (servingsLabel) metaItems.push({ icon: Users, label: "Portionen", value: servingsLabel });
  const prep = optionalMinutes(recipe.prepMinutes);
  if (prep) metaItems.push({ icon: Timer, label: "Arbeitszeit", value: prep });
  const cook = optionalMinutes(recipe.cookMinutes);
  if (cook) metaItems.push({ icon: Flame, label: "Backzeit", value: cook });
  const total = optionalMinutes(recipe.totalMinutes);
  if (total) metaItems.push({ icon: Clock, label: "Gesamt", value: total });

  return (
    <article className="recipe-print flex flex-col gap-5 pb-tabbar">
      <div className="flex flex-col gap-3">
        {image ? (
          <img
            src={image}
            alt={`Foto von ${recipe.title}`}
            className="aspect-4/3 w-full rounded-card object-cover shadow-card sm:aspect-21/9"
          />
        ) : (
          <div
            data-print="hide"
            className="flex aspect-4/3 w-full items-center justify-center rounded-card bg-surface-2 text-fg-subtle sm:aspect-21/9"
          >
            <UtensilsCrossed aria-hidden="true" className="size-12" />
          </div>
        )}

        {/*
          One trigger, not a toolbar: five icon buttons here took ~240px away from the
          heading on a phone, and the row grew or shrank with `canEdit`, so the title
          reflowed as the permission resolved. Everything lives in the ActionMenu now.
        */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl leading-tight font-semibold text-fg sm:text-3xl">
              {recipe.title}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Von {recipe.author.name} · {formatRelative(recipe.updatedAt)}
            </p>
          </div>

          <div data-print="hide" className="shrink-0">
            <ActionMenu
              label="Rezept-Aktionen"
              title={recipe.title}
              items={[
                canEdit && {
                  label: "Bearbeiten",
                  icon: <Pencil />,
                  onSelect: () => {
                    void navigate({
                      to: "/recipes/$recipeId/edit",
                      params: { recipeId: recipe.id },
                    });
                  },
                },
                {
                  label: "Teilen",
                  icon: <Share2 />,
                  onSelect: () => void share(),
                },
                {
                  label: "Als Text kopieren",
                  icon: <Copy />,
                  onSelect: () => void copyIngredients(),
                },
                {
                  label: "Drucken",
                  icon: <Printer />,
                  onSelect: () => window.print(),
                },
                {
                  label: "Duplizieren",
                  // The menu closes on select, so `isPending` is no longer visible —
                  // disabling is what keeps a second tap from creating a second copy.
                  description: createRecipe.isPending ? "Kopie wird angelegt …" : undefined,
                  icon: <ChefHat />,
                  disabled: createRecipe.isPending,
                  onSelect: () => void duplicate(),
                },
                canEdit && {
                  label: "Löschen",
                  icon: <Trash2 />,
                  variant: "danger" as const,
                  onSelect: () => setConfirmDelete(true),
                },
              ]}
            />
          </div>
        </div>

        {recipe.description ? (
          <p className="max-w-prose leading-relaxed text-fg-muted">{recipe.description}</p>
        ) : null}

        {(recipe.tags.length > 0 || recipe.difficulty || typeof recipe.rating === "number") ? (
          <ul className="flex flex-wrap items-center gap-1.5">
            {recipe.difficulty ? (
              <li>
                <Badge variant="accent">{difficultyLabels[recipe.difficulty]}</Badge>
              </li>
            ) : null}
            {typeof recipe.rating === "number" && recipe.rating > 0 ? (
              <li>
                <Badge variant="warning" icon={<Star className="fill-current" />}>
                  {recipe.rating} / 5
                </Badge>
              </li>
            ) : null}
            {recipe.tags.map((tag) => (
              <li key={tag.id}>
                <TagChip tag={tag} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {metaItems.length > 0 ? (
        <Card padding="none">
          <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            {metaItems.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5 p-3">
                <dt className="flex items-center gap-1.5 text-xs tracking-wide text-fg-muted uppercase">
                  <item.icon aria-hidden="true" className="size-3.5" />
                  {item.label}
                </dt>
                <dd className="font-medium text-fg">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr] lg:items-start">
        <Card padding="md" className="flex flex-col gap-3 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Zutaten</h2>
            {recipe.ingredients.length > 0 ? (
              <span className="text-sm text-fg-subtle">
                {recipe.ingredients.length} {recipe.ingredients.length === 1 ? "Zutat" : "Zutaten"}
              </span>
            ) : null}
          </div>

          {baseServings ? (
            <div data-print="hide">
              <ServingsScaler
                value={servings}
                baseValue={baseServings}
                unit={recipe.servingsUnit}
                onChange={(value) => setServingsOverride(value)}
              />
            </div>
          ) : null}

          {scaled ? (
            <p role="status" className="text-sm text-brand">
              Mengen umgerechnet (Faktor {Math.round(factor * 100) / 100}). Prisen und Spritzer
              bleiben unverändert.
            </p>
          ) : null}

          <IngredientList ingredients={scaledIngredients} scaled={scaled} />

          {/*
            Sits under the ingredients on purpose: this is where the portion count was
            just chosen, and the dialog carries that exact number over to the list.
          */}
          {recipe.ingredients.length > 0 ? (
            <Button
              data-print="hide"
              variant="secondary"
              fullWidth
              leftIcon={<ShoppingBasket className="size-4" />}
              onClick={() => setShoppingOpen(true)}
            >
              Zur Einkaufsliste
            </Button>
          ) : null}
        </Card>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Zubereitung</h2>
            <div data-print="hide" className="flex items-center gap-2">
              {checked.doneCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={checked.reset}
                  leftIcon={<RotateCcw className="size-4" />}
                >
                  Zurücksetzen ({checked.doneCount})
                </Button>
              ) : null}
              {recipe.steps.length > 0 ? (
                <Button
                  type="button"
                  onClick={() => setCookMode(true)}
                  leftIcon={<ListChecks className="size-4" />}
                >
                  Kochmodus
                </Button>
              ) : null}
            </div>
          </div>

          <StepList steps={recipe.steps} checked={checked} />

          {recipe.notes ? (
            <Card padding="md">
              <h2 className="mb-2 font-display text-lg font-semibold">Notizen</h2>
              <p className="leading-relaxed whitespace-pre-line text-fg-muted">{recipe.notes}</p>
            </Card>
          ) : null}

          {sourceHref || recipe.sourceName ? (
            <Card padding="md">
              <h2 className="mb-1 text-sm font-semibold tracking-wide text-fg-muted uppercase">
                Quelle
              </h2>
              {sourceHref ? (
                <a
                  href={sourceHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  data-print-url=""
                  className="inline-flex items-center gap-1.5 font-medium text-brand hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {recipe.sourceName ?? host ?? sourceHref}
                  <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              ) : (
                <p className="text-fg">{recipe.sourceName}</p>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      {cookMode ? (
        <CookMode
          title={recipe.title}
          steps={recipe.steps}
          ingredients={scaledIngredients}
          checked={checked}
          onClose={() => setCookMode(false)}
        />
      ) : null}

      <AddRecipeToListDialog
        open={shoppingOpen}
        onClose={() => setShoppingOpen(false)}
        recipe={recipe}
        initialServings={servings}
        lists={shoppingLists.data ?? []}
        listsLoading={shoppingLists.isPending}
        submitting={addToShoppingList.isPending}
        // Creating a list is online-only (see lib/persist.ts: only ITEM mutations are
        // queued offline), so the offer is hidden rather than shown and then failing.
        canCreateList={isOnline}
        creatingList={createShoppingList.isPending}
        onCreateList={(name) => createShoppingList.mutateAsync({ name })}
        onSubmit={async ({ listId, servings: targetServings, ingredientIds }) => {
          try {
            const result = await addToShoppingList.addRecipe({
              groupId: groupId ?? "",
              listId,
              recipeId: recipe.id,
              servings: targetServings,
              ingredientIds,
            });
            setShoppingOpen(false);
            toast.success(
              "Auf der Einkaufsliste",
              `${result.list.name} · ${result.items.length} ${result.items.length === 1 ? "Position" : "Positionen"}`,
            );
          } catch (error) {
            toast.fromError(error, "Konnte nicht hinzugefügt werden");
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        destructive
        title="Rezept löschen?"
        description={`„${recipe.title}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Löschen"
        onConfirm={async () => {
          try {
            await deleteRecipe.mutateAsync(recipe.id);
            toast.success("Rezept gelöscht");
            navigate({ to: "/", replace: true });
          } catch (error) {
            toast.fromError(error, "Löschen fehlgeschlagen");
            throw error;
          }
        }}
      />
    </article>
  );
}

/** Named export as well — the router accepts either (see lib/lazy-page.tsx). */
export { RecipeDetailPage };
