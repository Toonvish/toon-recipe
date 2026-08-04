import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Mail } from "lucide-react";
import { ForgotPasswordRequestSchema } from "@toon/shared";
import { useMutation } from "@tanstack/react-query";
import { requestPasswordReset } from "@/lib/api";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { AuthLayout } from "./AuthLayout";

/**
 * `/forgot-password` — asks for a reset link.
 *
 * THE CONFIRMATION IS THE SAME NO MATTER WHAT. The API answers 204 for a known and
 * an unknown address alike so it cannot be used to find out who has an account
 * here, and this screen must not undo that: it shows one "Wenn es ein Konto mit
 * dieser Adresse gibt …" panel on success, never "E-Mail nicht gefunden". The only
 * failures rendered are the ones that say nothing about the account — a malformed
 * address (client-side) and a rate limit.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submittedTo, setSubmittedTo] = useState<string | null>(null);

  const requestReset = useMutation({
    mutationFn: (address: string) => requestPasswordReset({ email: address }),
    onSuccess: (_data, address) => setSubmittedTo(address),
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(ForgotPasswordRequestSchema, { email });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    requestReset.mutate(result.data.email);
  }

  if (submittedTo !== null) {
    return (
      <AuthLayout
        title="E-Mail unterwegs"
        description="Prüfe dein Postfach."
        footer={
          <Link to="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
            Zurück zur Anmeldung
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 aria-hidden className="size-10 text-success" />
          <p className="text-sm text-fg">
            Wenn es ein Konto mit der Adresse <strong className="break-all">{submittedTo}</strong>{" "}
            gibt, haben wir einen Link zum Zurücksetzen verschickt.
          </p>
          <p className="text-sm text-fg-muted">
            Der Link gilt eine Stunde und kann nur einmal verwendet werden. Schau notfalls auch im
            Spam-Ordner nach.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSubmittedTo(null);
              requestReset.reset();
            }}
          >
            Andere Adresse verwenden
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Passwort vergessen"
      description="Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst."
      footer={
        <>
          Passwort wieder eingefallen?{" "}
          <Link to="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
            Zur Anmeldung
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {errors._form ? <ErrorState inline description={errors._form} /> : null}

        <Input
          label="E-Mail"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          leftIcon={<Mail />}
          placeholder="du@beispiel.de"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            setErrors((current) => clearField(current, "email"));
          }}
        />

        <Button type="submit" size="lg" fullWidth loading={requestReset.isPending}>
          Link anfordern
        </Button>

        <p className="text-xs text-fg-muted">
          Melde dich mit Google oder GitHub an, falls du dein Konto so angelegt hast — dann brauchst
          du kein Passwort.
        </p>
      </form>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
