/**
 * /import/:draftId — the review screen.
 *
 * OCR is never perfect, so this is the screen that decides whether importing is
 * pleasant or painful:
 *   - source on the left / parsed fields on the right (tabs on mobile),
 *   - "bitte prüfen" flags from the per-field confidence,
 *   - bulk fixers that turn raw lines into ingredients or steps,
 *   - autosave (~1s debounced PATCH) so a phone interruption loses nothing,
 *   - explicit German handling for every API failure.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowLeft, Check, CircleAlert, FileText, LoaderCircle, PenLine, Save, Trash2, TriangleAlert, Users } from "lucide-react";
import type { ParsedRecipe } from "@toon/shared";
import { useT } from "@/lib/i18n";
import {
  Button,
  ConfirmDialog,
  Label,
  Select,
  readChangeValue,
  useActiveGroupState,
  useImportAvailability,
  useShellToast,
} from "./lib/shell";
import { useDraftIdFromRoute, useImportNavigation } from "./lib/navigation";
import { useCommitDraft, useDeleteDraft, useDraft, useGroupTags } from "./lib/queries";
import { useDraftAutosave } from "./lib/useAutosave";
import { appendIngredientFromLine, appendStepFromLine, normalizeParsedRecipe, validateForCommit } from "./lib/draftEdit";
import { CONFIDENCE_WARN, countRowsNeedingCheck, formatConfidence } from "./lib/confidence";
import { resolveDescribedError, resolveImportErrorText } from "./lib/importErrorText";
import SourceViewer from "./components/SourceViewer";
import ParsedRecipeEditor from "./components/ParsedRecipeEditor";
import ImportErrorPanel from "./components/ImportErrorPanel";
import { describeDraftSource } from "./components/PendingDraftsList";

export interface ImportReviewPageProps {
  /** Optional override when the route param is named differently. */
  draftId?: string;
}

type MobileTab = "source" | "form";

export default function ImportReviewPage({ draftId: draftIdProp }: ImportReviewPageProps = {}) {
  const t = useT();
  const draftId = useDraftIdFromRoute(draftIdProp);
  const navigation = useImportNavigation();
  const toast = useShellToast();
  const offline = useImportAvailability();
  const { groupId: activeGroupId, groups, switchGroup } = useActiveGroupState();

  const candidateGroupIds = useMemo(() => {
    const ids: string[] = [];
    if (typeof activeGroupId === "string" && activeGroupId.length > 0) ids.push(activeGroupId);
    for (const group of groups) if (!ids.includes(group.id)) ids.push(group.id);
    return ids;
  }, [activeGroupId, groups]);

  const draftQuery = useDraft(draftId, candidateGroupIds);
  const draft = draftQuery.data?.draft;
  const draftGroupId = draftQuery.data?.groupId;

  const tagsQuery = useGroupTags(draftGroupId);
  const tagSuggestions = useMemo(() => (tagsQuery.data ?? []).map((tag) => tag.name), [tagsQuery.data]);

  const [parsed, setParsed] = useState<ParsedRecipe | undefined>(undefined);
  const [loadedDraftId, setLoadedDraftId] = useState<string | undefined>(undefined);
  const [mobileTab, setMobileTab] = useState<MobileTab>("form");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [commitError, setCommitError] = useState<unknown>(undefined);

  // Adopt the server payload exactly once per draft, so autosave never fights typing.
  useEffect(() => {
    if (draft === undefined) return;
    if (loadedDraftId === draft.id) return;
    setParsed(normalizeParsedRecipe(draft.parsed));
    setLoadedDraftId(draft.id);
  }, [draft, loadedDraftId]);

  const autosave = useDraftAutosave({
    groupId: draftGroupId,
    draftId: draft?.id,
    value: parsed,
    baseline: draft?.parsed,
    enabled: draft !== undefined && draft.status === "pending",
  });

  const commit = useCommitDraft();
  const remove = useDeleteDraft();

  const validation = useMemo(
    () => (parsed === undefined ? { ok: false, problems: [], warnings: [] } : validateForCommit(parsed)),
    [parsed],
  );
  const rowChecks = useMemo(
    () => (parsed === undefined ? { ingredients: 0, steps: 0 } : countRowsNeedingCheck(parsed)),
    [parsed],
  );

  const handleSave = useCallback(async () => {
    if (parsed === undefined || draft === undefined || draftGroupId === undefined) return;
    setCommitError(undefined);
    const normalized = normalizeParsedRecipe(parsed);
    const check = validateForCommit(normalized);
    if (!check.ok) {
      toast({ title: check.problems[0] ?? t("import.review.toast.saveFallback"), variant: "error" });
      setMobileTab("form");
      return;
    }
    try {
      await autosave.saveNow();
      const response = await commit.mutateAsync({
        groupId: draftGroupId,
        draftId: draft.id,
        parsed: normalized,
        tags: normalized.tags,
      });
      toast({ title: t("import.review.toast.saved.title"), description: response.recipe.title, variant: "success" });
      navigation.toRecipe(response.recipe.id, { replace: true });
    } catch (error) {
      setCommitError(error);
    }
  }, [autosave, commit, draft, draftGroupId, navigation, parsed, t, toast]);

  const handleDiscard = useCallback(() => {
    if (draft === undefined || draftGroupId === undefined) return;
    setConfirmOpen(false);
    remove.mutate(
      { groupId: draftGroupId, draftId: draft.id },
      {
        onSuccess: () => {
          toast({ title: t("import.review.toast.discarded.title"), variant: "info" });
          navigation.toImport({ replace: true });
        },
        onError: (error) => {
          const described = resolveDescribedError(t, error);
          toast({ title: described.title, description: described.hint, variant: "error" });
        },
      },
    );
  }, [draft, draftGroupId, navigation, remove, t, toast]);

  const addLineAsIngredient = useCallback((line: string) => {
    setParsed((current) => (current === undefined ? current : appendIngredientFromLine(current, line)));
  }, []);

  const addLineAsStep = useCallback((line: string) => {
    setParsed((current) => (current === undefined ? current : appendStepFromLine(current, line)));
  }, []);

  /* ------------------------------ load states ----------------------------- */

  if (draftId === undefined) {
    return (
      <PageShell onBack={() => navigation.toImport()}>
        <ImportErrorPanel
          error={new Error(t("import.review.noDraft"))}
          actions={
            <Button type="button" variant="secondary" onClick={() => navigation.toImport()}>
              {t("import.review.toImport")}
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (draftQuery.isLoading) {
    return (
      <PageShell onBack={() => navigation.toImport()}>
        <div className="space-y-3" aria-busy="true">
          <div className="h-8 w-2/3 animate-pulse rounded bg-skeleton" />
          <div className="h-56 animate-pulse rounded-xl bg-surface-2" />
          <div className="h-72 animate-pulse rounded-xl bg-surface-2" />
        </div>
      </PageShell>
    );
  }

  if (draftQuery.isError || draft === undefined || draftGroupId === undefined || parsed === undefined) {
    return (
      <PageShell onBack={() => navigation.toImport()}>
        <ImportErrorPanel
          error={draftQuery.error ?? new Error(t("import.review.loadError"))}
          onRetry={() => void draftQuery.refetch()}
          actions={
            <Button type="button" variant="secondary" onClick={() => navigation.toImport()}>
              {t("import.review.toOverview")}
            </Button>
          }
        />
      </PageShell>
    );
  }

  const overall = draft.confidence ?? parsed.confidence.overall;
  const source = describeDraftSource(draft);
  const SourceIcon = source.icon;
  const groupMismatch = activeGroupId !== undefined && activeGroupId !== draftGroupId;
  const groupOfDraft = groups.find((group) => group.id === draftGroupId);
  const committed = draft.status === "reviewed" && typeof draft.recipeId === "string";

  return (
    <PageShell onBack={() => navigation.toImport()}>
      {/* ------------------------------ header ------------------------------ */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SourceIcon aria-hidden className="h-4 w-4 text-fg-subtle" />
          <span className="text-xs text-fg-muted">{source.label}</span>
          <span className="text-xs text-fg-subtle">·</span>
          <span className="text-xs text-fg-muted">{t("import.review.quality", { value: formatConfidence(overall) })}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs">
            {autosave.state === "saving" ? (
              <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin text-fg-subtle" />
            ) : autosave.state === "saved" ? (
              <Check aria-hidden className="h-3.5 w-3.5 text-brand" />
            ) : autosave.state === "error" ? (
              <CircleAlert aria-hidden className="h-3.5 w-3.5 text-danger" />
            ) : (
              <PenLine aria-hidden className="h-3.5 w-3.5 text-fg-subtle" />
            )}
            <span
              className={clsx(
                autosave.state === "error" ? "text-danger" : "text-fg-muted",
              )}
            >
              {autosave.label}
            </span>
          </span>
        </div>

        <h1 className="text-lg font-semibold text-fg">
          {(parsed.title ?? "").trim().length > 0 ? parsed.title : t("import.review.title.fallback")}
        </h1>
      </div>

      {autosave.state === "error" ? (
        <div className="rounded-xl border border-danger/40 bg-danger-soft p-3 text-xs">
          <p className="font-medium text-danger-soft-fg">{t("import.review.autosaveError.title")}</p>
          <p className="mt-1 text-danger-soft-fg">{autosave.errorHint}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => void autosave.saveNow()}>
            {t("import.review.autosaveError.retry")}
          </Button>
        </div>
      ) : null}

      {committed ? (
        <div className="rounded-xl border border-success/40 bg-brand-soft p-3 text-xs">
          <p className="font-medium text-success-soft-fg">{t("import.review.committed.title")}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => navigation.toRecipe(String(draft.recipeId))}
          >
            {t("import.review.committed.open")}
          </Button>
        </div>
      ) : null}

      {groupMismatch ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-xs">
          <Users aria-hidden className="h-4 w-4 text-warning" />
          <span className="text-warning-soft-fg">
            {t("import.review.groupMismatch.text", {
              groupName: groupOfDraft?.name ?? t("import.review.groupMismatch.fallbackName"),
            })}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={() => switchGroup(draftGroupId)}>
            {t("import.review.groupMismatch.switch")}
          </Button>
        </div>
      ) : null}

      {groups.length > 1 && !groupMismatch ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <Label htmlFor="review-group" className="text-xs">
            {t("import.common.targetGroup")}
          </Label>
          <Select
            id="review-group"
            containerClassName="min-w-40"
            value={draftGroupId}
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
            onChange={(event) => {
              const next = readChangeValue(event);
              // The draft itself cannot be moved between groups by the API, so we
              // only switch the app's active group and say so.
              switchGroup(next);
              if (next !== draftGroupId) {
                toast({
                  title: t("import.review.groupStays.title"),
                  description: t("import.review.groupStays.description"),
                  variant: "info",
                });
              }
            }}
          />
        </div>
      ) : null}

      {overall < CONFIDENCE_WARN ? (
        <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-xs leading-5 text-warning-soft-fg">
            <p className="font-medium">{t("import.review.lowConfidence.title")}</p>
            <p>
              {t("import.review.lowConfidence.hint")}
              {rowChecks.ingredients + rowChecks.steps > 0
                ? ` ${t("import.review.lowConfidence.countHint", {
                    ingredients: rowChecks.ingredients,
                    steps: rowChecks.steps,
                  })}`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      {/* ------------------------- mobile tab switch ----------------------- */}
      <div className="flex gap-1 rounded-lg bg-surface-2 p-1 lg:hidden" role="tablist" aria-label={t("import.review.tabs.ariaLabel")}>
        <TabButton active={mobileTab === "source"} onClick={() => setMobileTab("source")}>
          <FileText aria-hidden className="h-3.5 w-3.5" />
          {t("import.review.tabs.source")}
        </TabButton>
        <TabButton active={mobileTab === "form"} onClick={() => setMobileTab("form")}>
          <PenLine aria-hidden className="h-3.5 w-3.5" />
          {t("import.review.tabs.form")}
          {rowChecks.ingredients + rowChecks.steps > 0 ? (
            <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold text-warning-soft-fg">
              {rowChecks.ingredients + rowChecks.steps}
            </span>
          ) : null}
        </TabButton>
      </div>

      {/* ------------------------------ panes ------------------------------ */}
      {/* `min-w-0` on both panes: a grid item's automatic minimum is its content's
          min-content width, so one wide child (a form row, a long raw-text line) would
          otherwise stretch the track past the viewport instead of wrapping. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className={clsx("min-w-0 lg:sticky lg:top-4", mobileTab === "source" ? "block" : "hidden lg:block")}>
          <SourceViewer draft={draft} onLineToIngredient={addLineAsIngredient} onLineToStep={addLineAsStep} />
        </div>
        <div className={clsx("min-w-0", mobileTab === "form" ? "block" : "hidden lg:block")}>
          <ParsedRecipeEditor value={parsed} onChange={setParsed} tagSuggestions={tagSuggestions} />
        </div>
      </div>

      {commitError !== undefined ? (
        <ImportErrorPanel error={commitError} onRetry={() => void handleSave()} retryLabel={t("import.review.retrySave")} />
      ) : null}

      {validation.warnings.length > 0 ? (
        <p className="text-xs text-fg-muted">{validation.warnings.join(" ")}</p>
      ) : null}

      {/*
        ------------------------------ footer -----------------------------
        `sticky bottom-tabbar`, NOT `fixed bottom-0`: the phone tab bar is fixed at
        `bottom-0` with the same z-index and paints after this (AppShell renders it
        below <main>), so `bottom-0` put "Speichern" and "Verwerfen" completely
        underneath it — the import could not be committed on a phone at all. Sticky
        also keeps the bar in flow, so `pb-tabbar` on AppShell's <main> is all the
        clearance the content needs. Same pattern as the shopping list's AddItemBar.
      */}
      <div className="sticky bottom-tabbar z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-safe">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            disabled={remove.isPending || commit.isPending}
          >
            <Trash2 aria-hidden className="mr-1.5 h-4 w-4" />
            {t("import.review.discard")}
          </Button>
          <span className="hidden flex-1 text-xs text-fg-muted sm:block">
            {offline.enabled
              ? validation.ok
                ? autosave.label
                : (validation.problems[0] ?? "")
              : offline.reason}
          </span>
          <Button
            type="button"
            className="ml-auto flex-1 sm:flex-none"
            onClick={() => void handleSave()}
            // Offline the commit would fail after the whole review was typed, and
            // the autosave PATCH cannot land either — the offline support here is
            // read-only on purpose (see lib/persist.ts).
            disabled={commit.isPending || !validation.ok || !offline.enabled}
            title={offline.reason}
          >
            {commit.isPending ? (
              <LoaderCircle aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden className="mr-2 h-4 w-4" />
            )}
            {commit.isPending ? t("import.review.saving") : t("import.review.save")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("import.review.discardDialog.title")}
        description={t("import.review.discardDialog.description")}
        message={t("import.review.discardDialog.message")}
        confirmLabel={t("import.review.discardDialog.confirm")}
        cancelLabel={t("import.review.discardDialog.cancel")}
        destructive
        variant="danger"
        onConfirm={handleDiscard}
        onCancel={() => setConfirmOpen(false)}
        onClose={() => setConfirmOpen(false)}
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false);
        }}
      />
    </PageShell>
  );
}

/**
 * No `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar` here: AppShell's `<main>` already applies
 * every one of those. Repeating them cost a phone 32px of the 390 it has — the reason
 * the Grunddaten card did not fit — and doubled the bottom padding.
 */
function PageShell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("import.review.back")}
      </button>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition",
        active
          ? "bg-surface text-fg shadow-sm"
          : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
