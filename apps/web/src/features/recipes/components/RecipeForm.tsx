/**
 * The one recipe form, used by RecipeNewPage and RecipeEditPage.
 *
 * - real `<form>` semantics, every control has a label
 * - client-side validation with the SAME zod schema the API uses
 *   (`CreateRecipeRequestSchema` via `validate` from @/lib/validation)
 * - server field errors are merged in, so a 422 lands on the right input
 * - submit is disabled while pending; navigating away while dirty asks for confirmation
 */
import { useEffect, useMemo, useState } from "react";
import { Save, WifiOff, X } from "lucide-react";
import {
  CreateRecipeRequestSchema,
  type CreateRecipeRequest,
  type Difficulty,
  type Tag,
} from "@toon/shared";
import type { Collection } from "@toon/shared";
import { Button, Card, ConfirmDialog, ErrorState, Input, Select, Textarea } from "@/components/ui";
import { difficultyLabels } from "@/lib/format";
import { useCanMutate } from "@/lib/session";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { TagCombobox } from "@/features/tags/components/TagCombobox";
import { useNavigationGuard } from "../lib/nav";
import {
  derivedTotalMinutes,
  formToRequest,
  isSameForm,
  type RecipeFormValues,
} from "../lib/formState";
import { IngredientsEditor } from "./IngredientsEditor";
import { StepsEditor } from "./StepsEditor";
import { RecipeImagePicker } from "./RecipeImagePicker";

export interface RecipeFormSubmit {
  payload: CreateRecipeRequest;
  /** Picked but not yet uploaded photo — the page uploads it after create/update. */
  file: File | null;
}

export interface RecipeFormProps {
  initialValues: RecipeFormValues;
  availableTags: readonly Tag[];
  availableCollections: readonly Collection[];
  onSubmit: (input: RecipeFormSubmit) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  pending: boolean;
  /** Error thrown by the mutation — field errors are extracted from it. */
  error?: unknown;
  imageHint?: string;
}

const DIFFICULTY_OPTIONS = [
  { value: "", label: "Keine Angabe" },
  { value: "einfach", label: difficultyLabels.einfach },
  { value: "mittel", label: difficultyLabels.mittel },
  { value: "schwer", label: difficultyLabels.schwer },
] as const;

const RATING_OPTIONS = [
  { value: "", label: "Keine Bewertung" },
  { value: "1", label: "1 Stern" },
  { value: "2", label: "2 Sterne" },
  { value: "3", label: "3 Sterne" },
  { value: "4", label: "4 Sterne" },
  { value: "5", label: "5 Sterne" },
] as const;

export function RecipeForm({
  initialValues,
  availableTags,
  availableCollections,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
  imageHint,
}: RecipeFormProps) {
  const [values, setValues] = useState<RecipeFormValues>(initialValues);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Re-seed when the underlying recipe finished loading.
  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const dirty = useMemo(
    () => !isSameForm(values, initialValues) || file !== null,
    [values, initialValues, file],
  );
  // Guards BOTH in-app navigation and the browser's unload prompt.
  const guard = useNavigationGuard(dirty && !pending);

  const serverErrors = useMemo(
    () => (error === undefined ? {} : apiFieldErrors(error)),
    [error],
  );
  const { canMutate, reason: offlineReason } = useCanMutate();
  const allErrors: FieldErrors = { ...serverErrors, ...errors };

  function set<Key extends keyof RecipeFormValues>(key: Key, value: RecipeFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => clearField(current, String(key)));
  }

  const collectionOptions = availableCollections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Belt and braces: the button is disabled offline, but Enter in a text field
    // submits a form too.
    if (!canMutate) return;

    const payload = formToRequest(values);
    const result = validate(CreateRecipeRequestSchema, payload);
    if (!result.ok) {
      setErrors(result.errors);
      // Move focus to the first invalid control so screen readers announce it.
      const firstKey = Object.keys(result.errors)[0];
      if (firstKey) {
        document
          .querySelector<HTMLElement>(`[aria-invalid="true"], [data-field="${firstKey}"]`)
          ?.focus();
      }
      return;
    }

    setErrors({});
    await onSubmit({ payload: result.data, file });
  }

  const totalHint = (() => {
    const derived = derivedTotalMinutes(values);
    if (derived === undefined || values.totalMinutes.trim().length > 0) return undefined;
    return `Vorschlag aus Arbeits- + Backzeit: ${derived} Min.`;
  })();

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 pb-tabbar">
      {allErrors._form ? <ErrorState inline error={error} description={allErrors._form} /> : null}

      <Card padding="md" className="flex flex-col gap-4">
        <Input
          label="Titel"
          required
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Apfelkuchen vom Blech"
          error={allErrors.title}
          disabled={pending}
          autoComplete="off"
        />

        <Textarea
          label="Kurzbeschreibung"
          optional
          autoGrow
          rows={3}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="Saftig, schnell gebacken und perfekt für Besuch."
          error={allErrors.description}
          disabled={pending}
        />

        <RecipeImagePicker
          url={values.imageUrl}
          onUrlChange={(url) => set("imageUrl", url)}
          file={file}
          onFileChange={setFile}
          disabled={pending}
          hint={imageHint}
        />
      </Card>

      <Card padding="md" className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Angaben</h2>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Portionen"
            inputMode="decimal"
            value={values.servingsAmount}
            onChange={(event) => set("servingsAmount", event.target.value)}
            placeholder="4"
            error={allErrors.servingsAmount}
            disabled={pending}
          />
          <Input
            label="Einheit"
            value={values.servingsUnit}
            onChange={(event) => set("servingsUnit", event.target.value)}
            placeholder="Portionen"
            error={allErrors.servingsUnit}
            disabled={pending}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Arbeitszeit (Min.)"
            inputMode="numeric"
            value={values.prepMinutes}
            onChange={(event) => set("prepMinutes", event.target.value)}
            placeholder="20"
            error={allErrors.prepMinutes}
            disabled={pending}
          />
          <Input
            label="Backzeit (Min.)"
            inputMode="numeric"
            value={values.cookMinutes}
            onChange={(event) => set("cookMinutes", event.target.value)}
            placeholder="35"
            error={allErrors.cookMinutes}
            disabled={pending}
          />
          <Input
            label="Gesamtzeit (Min.)"
            inputMode="numeric"
            value={values.totalMinutes}
            onChange={(event) => set("totalMinutes", event.target.value)}
            placeholder="55"
            hint={totalHint}
            error={allErrors.totalMinutes}
            disabled={pending}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Schwierigkeit"
            options={DIFFICULTY_OPTIONS}
            value={values.difficulty}
            onChange={(event) => set("difficulty", event.target.value as Difficulty | "")}
            error={allErrors.difficulty}
            disabled={pending}
          />
          <Select
            label="Bewertung"
            options={RATING_OPTIONS}
            value={values.rating}
            onChange={(event) => set("rating", event.target.value)}
            error={allErrors.rating}
            disabled={pending}
          />
        </div>

        <TagCombobox
          value={values.tags}
          onChange={(tags) => set("tags", tags)}
          available={availableTags}
          disabled={pending}
          error={allErrors.tags}
        />

        {collectionOptions.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-fg">Sammlungen</legend>
            <ul className="flex flex-col gap-1">
              {availableCollections.map((collection) => {
                const checked = values.collectionIds.includes(collection.id);
                return (
                  <li key={collection.id}>
                    <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={(event) =>
                          set(
                            "collectionIds",
                            event.target.checked
                              ? [...values.collectionIds, collection.id]
                              : values.collectionIds.filter((id) => id !== collection.id),
                          )
                        }
                        className="size-5 accent-[var(--brand)]"
                      />
                      {collection.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}
      </Card>

      <Card padding="md">
        <IngredientsEditor
          rows={values.ingredients}
          onChange={(rows) => set("ingredients", rows)}
          errors={allErrors}
          disabled={pending}
        />
      </Card>

      <Card padding="md">
        <StepsEditor
          rows={values.steps}
          onChange={(rows) => set("steps", rows)}
          errors={allErrors}
          disabled={pending}
        />
      </Card>

      <Card padding="md" className="flex flex-col gap-4">
        <Textarea
          label="Notizen"
          optional
          autoGrow
          rows={3}
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
          placeholder="Mit Vanilleeis servieren. Hält sich 2 Tage."
          error={allErrors.notes}
          disabled={pending}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Quelle (URL)"
            type="url"
            inputMode="url"
            optional
            value={values.sourceUrl}
            onChange={(event) => set("sourceUrl", event.target.value)}
            placeholder="https://www.chefkoch.de/…"
            error={allErrors.sourceUrl}
            disabled={pending}
          />
          <Input
            label="Quelle (Name)"
            optional
            value={values.sourceName}
            onChange={(event) => set("sourceName", event.target.value)}
            placeholder="Chefkoch"
            error={allErrors.sourceName}
            disabled={pending}
          />
        </div>
      </Card>

      {/* Sticky action bar so "Speichern" is always reachable with the thumb. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm lg:mx-0 lg:rounded-card lg:border">
        {/* Offline support is read-only (no mutation outbox, no conflict story for
            two members editing one recipe), so say so instead of letting the save
            fail after the user typed a whole recipe. */}
        {canMutate ? null : (
          <p role="status" className="flex items-center gap-2 text-sm text-warning-soft-fg">
            <WifiOff aria-hidden className="size-4 shrink-0" />
            {offlineReason}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={pending}
            fullWidth
            leftIcon={<X className="size-4" />}
          >
            Abbrechen
          </Button>
          <Button
            type="submit"
            loading={pending}
            disabled={!canMutate}
            title={offlineReason}
            fullWidth
            leftIcon={<Save className="size-4" />}
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={guard.blocked}
        onClose={guard.reset}
        destructive
        title="Ungespeicherte Änderungen"
        description="Wenn du diese Seite verlässt, gehen deine Eingaben verloren."
        confirmLabel="Verlassen"
        cancelLabel="Hier bleiben"
        onConfirm={guard.proceed}
      />
    </form>
  );
}
