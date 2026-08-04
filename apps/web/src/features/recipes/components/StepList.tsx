/**
 * Step list with a tappable "erledigt" state. The state lives in sessionStorage
 * (see useCheckedSteps) so it survives navigating away and back.
 */
import { Check } from "lucide-react";
import type { RecipeStepRecord } from "@toon/shared";
import { cn } from "@/lib/cn";
import { groupBySection } from "../lib/format";
import type { CheckedSteps } from "../lib/hooks";

export interface StepListProps {
  steps: readonly RecipeStepRecord[];
  checked: CheckedSteps;
  className?: string;
}

export function StepList({ steps, checked, className }: StepListProps) {
  if (steps.length === 0) {
    return <p className="text-sm text-fg-muted">Für dieses Rezept sind keine Schritte erfasst.</p>;
  }

  const groups = groupBySection(steps);
  let number = 0;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {groups.map((group, groupIndex) => (
        <section key={group.section ?? `group-${groupIndex}`} className="flex flex-col gap-2">
          {group.section ? (
            <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
              {group.section}
            </h3>
          ) : null}
          <ol className="flex flex-col gap-2">
            {group.items.map((step) => {
              number += 1;
              const done = checked.isDone(step.id);
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() => checked.toggle(step.id)}
                    className={cn(
                      "flex w-full gap-3 rounded-card border p-3 text-left transition-colors",
                      done
                        ? "border-success/40 bg-success-soft/60"
                        : "border-line bg-surface hover:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                        done ? "bg-success text-white" : "bg-brand-soft text-brand-soft-fg",
                      )}
                    >
                      {done ? <Check className="size-4" /> : number}
                    </span>
                    <span
                      className={cn(
                        "flex-1 leading-relaxed whitespace-pre-line",
                        done ? "text-fg-muted line-through decoration-1" : "text-fg",
                      )}
                    >
                      {step.text}
                    </span>
                    <span className="sr-only">{done ? "erledigt" : "als erledigt markieren"}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
