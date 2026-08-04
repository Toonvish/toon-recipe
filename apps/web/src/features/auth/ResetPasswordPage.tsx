import { useState, type FormEvent } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PasswordSchema } from "@toon/shared";
import { isApiError, resetPassword } from "@/lib/api";
import { useGoTo } from "@/lib/navigation";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PasswordInput } from "@/components/ui/Input";
import { AuthLayout } from "./AuthLayout";

/**
 * `/reset-password/$token` — sets a new password from a mailed link.
 *
 * Sends the user to `/login` afterwards rather than signing them in: the reset
 * deletes EVERY session of that account (a stolen cookie is exactly what someone
 * resets because of), so the next step is a normal login with the new password.
 *
 * A dead link (unknown, expired or already used) is one indistinguishable
 * `reset_token_invalid` from the API — this screen offers "neu anfordern" instead of
 * guessing which of the three it was.
 */
export function ResetPasswordPage() {
  const { token } = useParams({ from: "/reset-password/$token" });
  const goTo = useGoTo();

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const submitReset = useMutation({
    mutationFn: (value: string) => resetPassword({ token, password: value }),
    onSuccess: () => {
      goTo("/login?reset=1", { replace: true });
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  const tokenDead =
    isApiError(submitReset.error) && submitReset.error.code === "reset_token_invalid";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(PasswordSchema, password);
    if (!result.ok) {
      setErrors({ password: result.errors.password ?? result.errors._form ?? "Passwort ungültig" });
      return;
    }
    if (password !== repeat) {
      setErrors({ repeat: "Die Passwörter stimmen nicht überein" });
      return;
    }
    setErrors({});
    submitReset.mutate(result.data);
  }

  if (tokenDead) {
    return (
      <AuthLayout
        title="Link nicht mehr gültig"
        description="Dieser Link wurde schon benutzt oder ist abgelaufen."
      >
        <div className="flex flex-col gap-4">
          <ErrorState
            inline
            title="Neuen Link anfordern"
            description="Reset-Links gelten eine Stunde und lassen sich nur einmal verwenden. Fordere einfach einen neuen an."
          />
          <Link to="/forgot-password">
            <Button size="lg" fullWidth>
              Neuen Link anfordern
            </Button>
          </Link>
          <Link
            to="/login"
            className="text-center text-sm font-semibold text-brand underline-offset-2 hover:underline"
          >
            Zurück zur Anmeldung
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Neues Passwort"
      description="Wähle ein neues Passwort für dein Konto."
      footer={
        <Link to="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
          Zurück zur Anmeldung
        </Link>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {errors._form ? <ErrorState inline description={errors._form} /> : null}

        <PasswordInput
          label="Neues Passwort"
          name="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          hint="Mindestens 8 Zeichen."
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
            setErrors((current) => clearField(current, "password"));
          }}
        />

        <PasswordInput
          label="Passwort wiederholen"
          name="repeat"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={repeat}
          error={errors.repeat}
          onChange={(event) => {
            setRepeat(event.currentTarget.value);
            setErrors((current) => clearField(current, "repeat"));
          }}
        />

        <Button type="submit" size="lg" fullWidth loading={submitReset.isPending}>
          Passwort speichern
        </Button>

        <p className="flex items-start gap-2 text-xs text-fg-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Aus Sicherheitsgründen wirst du danach auf allen Geräten abgemeldet und musst dich einmal
          neu anmelden.
        </p>
      </form>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
