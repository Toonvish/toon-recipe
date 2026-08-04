import { useEffect, useRef } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { confirmEmailVerification, isApiError } from "@/lib/api";
import { invalidate } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { FullPageLoader } from "@/components/ui/Spinner";
import { AuthLayout } from "./AuthLayout";

/**
 * `/verify-email/$token` — confirms an address from a mailed link.
 *
 * Public: the link is regularly opened on a phone while the desktop holds the
 * session, so the token IS the authorisation and no login is required. When there
 * happens to be a session, the bootstrap query is invalidated so the settings screen
 * immediately stops nagging.
 */
export function VerifyEmailPage() {
  const { token } = useParams({ from: "/verify-email/$token" });
  const queryClient = useQueryClient();

  const confirm = useMutation({
    mutationFn: () => confirmEmailVerification({ token }),
    onSuccess: () => {
      void invalidate.me(queryClient);
    },
  });

  // Fire exactly once. React 19 StrictMode double-invokes effects in development,
  // and the token is single-use — a second call would report "Link ungültig" for a
  // confirmation that had in fact just succeeded.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    confirm.mutate();
  }, [confirm]);

  if (confirm.isPending || confirm.isIdle) {
    return <FullPageLoader label="E-Mail-Adresse wird bestätigt …" />;
  }

  if (confirm.isError) {
    const dead =
      isApiError(confirm.error) && confirm.error.code === "verification_token_invalid";
    return (
      <AuthLayout title="Bestätigung fehlgeschlagen">
        <div className="flex flex-col gap-4">
          <ErrorState
            inline
            title={dead ? "Link nicht mehr gültig" : "Das hat nicht funktioniert"}
            description={
              dead
                ? "Bestätigungslinks gelten 24 Stunden und lassen sich nur einmal verwenden. Fordere in den Einstellungen einen neuen an."
                : "Bitte versuche es später noch einmal."
            }
          />
          <Link to="/settings">
            <Button size="lg" fullWidth>
              Zu den Einstellungen
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="E-Mail bestätigt" description="Danke — die Adresse gehört jetzt dir.">
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 aria-hidden className="size-10 text-success" />
        <p className="text-sm text-fg-muted">
          Du kannst dein Passwort jetzt jederzeit über „Passwort vergessen“ zurücksetzen.
        </p>
        <Link to="/" className="w-full">
          <Button size="lg" fullWidth>
            Zu den Rezepten
          </Button>
        </Link>
      </div>
    </AuthLayout>
  );
}

export default VerifyEmailPage;
