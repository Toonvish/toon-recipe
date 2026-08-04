import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { LoginRequestSchema } from "@toon/shared";
import { useLogin, useSession } from "@/lib/session";
import { safeNextPath, useGoTo, useSearchParams } from "@/lib/navigation";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, PasswordInput } from "@/components/ui/Input";
import { AuthLayout } from "./AuthLayout";
import { AuthDivider, OAuthButtons, useHasOAuthProviders } from "./OAuthButtons";

/** `/login` — e-mail + password and both OAuth providers. */
export function LoginPage() {
  const search = useSearchParams();
  const next = safeNextPath(search.next);
  const goTo = useGoTo();
  const { isAuthenticated, isLoading } = useSession();
  const login = useLogin();
  const hasOAuth = useHasOAuthProviders();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Already signed in? Skip the form.
  useEffect(() => {
    if (!isLoading && isAuthenticated) goTo(next, { replace: true });
  }, [isLoading, isAuthenticated, next, goTo]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(LoginRequestSchema, { email, password });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    login.mutate(result.data, {
      onSuccess: () => goTo(next, { replace: true }),
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  }

  return (
    <AuthLayout
      title="Willkommen zurück"
      description="Melde dich an, um auf die Rezepte deiner Gruppen zuzugreifen."
      footer={
        <>
          Noch kein Konto?{" "}
          <Link
            to="/register"
            search={next === "/" ? {} : { next }}
            className="font-semibold text-brand underline-offset-2 hover:underline"
          >
            Jetzt registrieren
          </Link>
        </>
      }
    >
      {search.error ? (
        <ErrorState
          inline
          className="mb-4"
          title="Anmeldung fehlgeschlagen"
          description={oauthErrorMessage(search.error)}
        />
      ) : null}

      <OAuthButtons next={next} disabled={login.isPending} />
      {hasOAuth ? <AuthDivider label="oder mit E-Mail" /> : null}

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

        <PasswordInput
          label="Passwort"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
            setErrors((current) => clearField(current, "password"));
          }}
        />

        <Button type="submit" size="lg" fullWidth loading={login.isPending}>
          Anmelden
        </Button>
      </form>
    </AuthLayout>
  );
}

function oauthErrorMessage(code: string | undefined): string {
  switch (code) {
    case "oauth_not_configured":
      return "Dieser Anbieter ist auf dem Server nicht konfiguriert.";
    case "oauth_failed":
      return "Der Anbieter hat die Anmeldung abgebrochen. Bitte versuche es erneut.";
    case "unauthorized":
      return "Deine Sitzung ist abgelaufen. Bitte melde dich neu an.";
    default:
      return "Bitte versuche es erneut.";
  }
}

export default LoginPage;
