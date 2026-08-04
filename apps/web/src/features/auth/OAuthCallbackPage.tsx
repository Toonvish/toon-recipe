import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { safeNextPath, useGoTo, useSearchParams } from "@/lib/navigation";
import { useSession } from "@/lib/session";
import { AuthLayout } from "./AuthLayout";

/**
 * `/oauth/callback` — landing page after the API finished the provider round-trip.
 * The session cookie is already set at this point, so all this screen does is
 * re-run the bootstrap query and forward the user (or explain what went wrong).
 */
export function OAuthCallbackPage() {
  const search = useSearchParams();
  const next = safeNextPath(search.next);
  const goTo = useGoTo();
  const { isAuthenticated, isLoading, refetch } = useSession();
  const [timedOut, setTimedOut] = useState(false);
  const started = useRef(false);

  const errorCode = search.error;

  useEffect(() => {
    if (errorCode || started.current) return;
    started.current = true;
    void refetch();
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [errorCode, refetch]);

  useEffect(() => {
    if (!errorCode && !isLoading && isAuthenticated) goTo(next, { replace: true });
  }, [errorCode, isLoading, isAuthenticated, next, goTo]);

  if (errorCode) {
    return (
      <AuthLayout title="Anmeldung abgebrochen">
        <ErrorState
          title="Das hat nicht funktioniert"
          description={
            errorCode === "oauth_not_configured"
              ? "Dieser Anmelde-Anbieter ist auf dem Server nicht konfiguriert."
              : "Der Anbieter hat die Anmeldung nicht abgeschlossen. Bitte versuche es noch einmal."
          }
          action={
            <Link to="/login" className={buttonClasses({})}>
              Zurück zur Anmeldung
            </Link>
          }
        />
      </AuthLayout>
    );
  }

  if (timedOut && !isAuthenticated) {
    return (
      <AuthLayout title="Anmeldung dauert länger">
        <ErrorState
          title="Keine Sitzung gefunden"
          description="Möglicherweise wurden Cookies blockiert. Bitte melde dich erneut an."
          onRetry={() => {
            void refetch();
          }}
          action={
            <Link to="/login" className={buttonClasses({ variant: "secondary" })}>
              Zur Anmeldung
            </Link>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Anmeldung läuft" description="Einen Moment, wir richten alles ein …">
      <LoadingBlock label="Sitzung wird geprüft …" />
    </AuthLayout>
  );
}

export default OAuthCallbackPage;
