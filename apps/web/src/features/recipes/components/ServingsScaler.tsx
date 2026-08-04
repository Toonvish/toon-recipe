/**
 * Servings stepper. Scaling itself happens with `scaleIngredients` from @toon/shared
 * (same function the API uses), so client and server always agree.
 */
import { Minus, Plus, RotateCcw } from "lucide-react";
import { formatQuantity } from "@toon/shared";
import { cn } from "@/lib/cn";

export interface ServingsScalerProps {
  /** Current servings shown. */
  value: number;
  /** Value stored on the recipe — enables the reset button. */
  baseValue: number;
  unit?: string | null;
  onChange: (value: number) => void;
  className?: string;
}

/** Steps in halves below 4 portions, in whole numbers above. */
function step(value: number): number {
  return value < 4 ? 0.5 : 1;
}

function clamp(value: number): number {
  return Math.min(1000, Math.max(0.5, Math.round(value * 100) / 100));
}

export function ServingsScaler({
  value,
  baseValue,
  unit,
  onChange,
  className,
}: ServingsScalerProps) {
  const noun = typeof unit === "string" && unit.trim().length > 0 ? unit.trim() : "Portionen";
  const changed = Math.abs(value - baseValue) > 0.001;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span id="servings-label" className="sr-only">
        Anzahl {noun}
      </span>
      <div className="inline-flex items-center rounded-full border border-line bg-surface shadow-soft">
        <button
          type="button"
          className="tap flex items-center justify-center rounded-l-full px-3 text-fg-muted hover:text-fg disabled:opacity-40"
          onClick={() => onChange(clamp(value - step(value)))}
          disabled={value <= 0.5}
          aria-label={`Weniger ${noun}`}
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>
        <output
          aria-live="polite"
          aria-labelledby="servings-label"
          className="min-w-24 px-1 text-center font-medium tabular-nums text-fg"
        >
          {formatQuantity(value)} {noun}
        </output>
        <button
          type="button"
          className="tap flex items-center justify-center rounded-r-full px-3 text-fg-muted hover:text-fg disabled:opacity-40"
          onClick={() => onChange(clamp(value + step(value)))}
          disabled={value >= 1000}
          aria-label={`Mehr ${noun}`}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
      {changed ? (
        <button
          type="button"
          onClick={() => onChange(baseValue)}
          className="tap inline-flex items-center gap-1 rounded-full px-2 text-sm text-brand hover:text-brand-hover"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Original
        </button>
      ) : null}
    </div>
  );
}
