import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Label } from "./Label";

export const controlClasses =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-fg " +
  "placeholder:text-fg-subtle shadow-soft transition-colors duration-150 " +
  "focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/40 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:outline-danger/40";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  /** Small icon rendered inside the field on the left. */
  leftIcon?: ReactNode;
  /** Element rendered inside the field on the right (e.g. a unit). */
  rightSlot?: ReactNode;
  className?: string;
  /** Class list for the outer wrapper. */
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    optional,
    leftIcon,
    rightSlot,
    className,
    containerClassName,
    id: idProp,
    required,
    type = "text",
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label ? (
        <Label htmlFor={id} required={required} optional={optional}>
          {label}
        </Label>
      ) : null}
      <div className="relative">
        {leftIcon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-subtle [&_svg]:size-5"
          >
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            controlClasses,
            "min-h-11",
            leftIcon && "pl-11",
            rightSlot && "pr-11",
            className,
          )}
          {...rest}
        />
        {rightSlot ? (
          <span className="absolute inset-y-0 right-2 flex items-center text-fg-subtle">
            {rightSlot}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export type PasswordInputProps = Omit<InputProps, "type" | "rightSlot">;

/** Password field with a "Passwort anzeigen" toggle (44px target). */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        rightSlot={
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
            title={visible ? "Passwort verbergen" : "Passwort anzeigen"}
            className="flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {visible ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        }
        {...props}
      />
    );
  },
);
