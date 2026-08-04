import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Adds the "(optional)" hint instead of a required marker. */
  optional?: boolean;
  required?: boolean;
  children: ReactNode;
}

export function Label({ optional, required, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn("block text-sm font-medium text-fg", className)} {...rest}>
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      ) : null}
      {optional ? <span className="ml-1 font-normal text-fg-subtle">(optional)</span> : null}
    </label>
  );
}
