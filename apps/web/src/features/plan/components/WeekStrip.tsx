/**
 * WeekStrip — the library's "Diese Woche" strip (A04 §3.2/§4, reconstructed, no
 * artboard — SPEC.md §1/D10). Always shows the week CONTAINING today
 * (`startOfPlanWeek`, i.e. its Monday), never a week the URL chose: unlike `/plan`
 * itself this is a preview, not a navigation surface, so it holds no `?week=` state
 * and its only navigation is the `plan.strip.link` beside the heading.
 *
 * Reuses `PlanDayCard` (T7.4) for all three drawn states (`planned`/`empty`/
 * `today`) rather than reimplementing them — the card, its `ActionMenu`s and its
 * dialogs are unchanged here; this component only decides WHICH days to show and
 * hands each one its slice of the week's entries, exactly like `PlanPage` does.
 *
 * Desktop renders all 7 days (`grid-cols-7`); a phone renders `week.slice(3,7)` —
 * the mock's own four-day crop (A04 §4 recommends scrolling all 7 instead, but the
 * task ruling is explicit that the slice is a decision, not an accident: those four
 * cards are still four real tap targets into the next few days, and `plan.strip.link`
 * next to the heading names where the rest of the week lives). `maxEntries={1}`
 * caps a busy day to its first entry plus a `+N` link to `/plan` (R36) — this strip
 * has no room for a second entry the way `/plan`'s own column does.
 */
import { ArrowRight } from "lucide-react";
import { planWeek, startOfPlanWeek, todayPlanDate, type MealPlanEntry, type PlanDate } from "@toon/shared";
import { SkeletonList } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useCanMutate, useEmailVerificationBlock, useSession } from "@/lib/session";
import { useMediaQuery } from "@/lib/viewport";
import { AppLink } from "@/features/recipes/lib/nav";
import { usePlanWeek } from "../lib/queries";
import { PlanDayCard } from "./PlanDayCard";

/** Matches `PlanDayCard`'s own local constant — Tailwind's `lg`, 1024px. */
const LG_QUERY = "(min-width: 64rem)";

/** A day holds several entries at most `(group_id, planned_on, recipe_id)`-unique. */
function groupByDay(items: readonly MealPlanEntry[]): Map<PlanDate, MealPlanEntry[]> {
  const byDay = new Map<PlanDate, MealPlanEntry[]>();
  for (const item of items) {
    const bucket = byDay.get(item.plannedOn);
    if (bucket) bucket.push(item);
    else byDay.set(item.plannedOn, [item]);
  }
  return byDay;
}

export interface WeekStripProps {
  groupId: string;
}

export function WeekStrip({ groupId }: WeekStripProps) {
  const t = useT();
  const { isOnline } = useSession();
  const unverified = useEmailVerificationBlock();
  const { canMutate } = useCanMutate();
  const isWide = useMediaQuery(LG_QUERY);

  const today = todayPlanDate();
  const week = planWeek(startOfPlanWeek(today));
  const visibleDays = isWide ? week : week.slice(3, 7);

  // `offlineFirst` (see `planQuery`), so a cold offline start still has the
  // persisted "plan" segment to render from — the strip's own gotcha.
  const query = usePlanWeek(groupId, week[0]!);

  // Same offline-hint composition as `/plan` itself (`plan.offlineHint` on top of
  // the shared unverified-address reason) — this is a read-only surface: the
  // day cards' own `disabled` state already covers "no offline write path to
  // gate", so no separate branch is needed here.
  const reason = unverified ?? (isOnline ? undefined : t("plan.offlineHint"));

  if (query.isPending) {
    return (
      <section className="flex flex-col gap-2.5">
        <Header t={t} />
        <SkeletonList variant="daycards" />
      </section>
    );
  }

  // A failed fetch never blocks the library from rendering — swallow into "no
  // plan yet" (empty drawn day cards) rather than an `ErrorState` (A04 §3.2).
  const byDay = groupByDay(query.data?.items ?? []);

  return (
    <section className="flex flex-col gap-2.5">
      <Header t={t} />
      <ol className="grid grid-cols-4 gap-2 lg:grid-cols-7">
        {visibleDays.map((day) => (
          <li key={day} className="min-w-0">
            <PlanDayCard
              groupId={groupId}
              date={day}
              entries={byDay.get(day) ?? []}
              maxEntries={1}
              isToday={day === today}
              canMutate={canMutate}
              reason={reason}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Header({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <header className="flex items-baseline gap-2.5">
      <h2 className="font-display text-xl font-medium">{t("plan.strip.heading")}</h2>
      <AppLink
        to="/plan"
        className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-hover"
      >
        {t("plan.strip.link")}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </AppLink>
    </header>
  );
}
