import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, Link2Off, LogOut, Monitor, Moon, Smartphone, Sun, Trash2 } from "lucide-react";
import {
  ChangePasswordRequestSchema,
  UpdateProfileRequestSchema,
  type OAuthProvider,
  type OAuthProviderStatus,
  type SessionInfo,
} from "@toon/shared";
import {
  changePassword,
  revokeSession,
  startOAuthLink,
  unlinkOAuthProvider,
  updateProfile,
} from "@/lib/api";
import { formatDateTime, formatRelative, truncate } from "@/lib/format";
import { invalidate, oauthProvidersQuery, sessionsQuery } from "@/lib/queries";
import { useSearchParams } from "@/lib/navigation";
import { useCurrentUser, useLogout, useSession } from "@/lib/session";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/**
 * `/settings` — profile, password, appearance and active sessions.
 * This is the auth-owned fallback screen; a dedicated settings page under
 * `src/features/settings/SettingsPage.tsx` takes precedence if one exists.
 */
export function AccountSettingsPage() {
  const user = useCurrentUser();
  const { refetch } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const logout = useLogout();
  const theme = useTheme();

  const [name, setName] = useState(user.name);
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});

  const saveProfile = useMutation({
    mutationFn: (nextName: string) => {
      const result = validate(UpdateProfileRequestSchema, { name: nextName });
      if (!result.ok) return Promise.reject(new Error(result.errors.name ?? "Name ungültig"));
      return updateProfile(result.data);
    },
    onSuccess: async () => {
      setProfileErrors({});
      await Promise.all([invalidate.me(queryClient), refetch()]);
      toast.success("Profil gespeichert");
    },
    onError: (error) => setProfileErrors(apiFieldErrors(error)),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Profil" description="Konto, Aussehen und angemeldete Geräte." />

      <Card padding="lg">
        <CardHeader title="Dein Konto" description={user.email} />
        <form
          className="flex flex-col gap-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            saveProfile.mutate(name.trim());
          }}
        >
          <Input
            label="Name"
            value={name}
            autoComplete="name"
            error={profileErrors.name ?? profileErrors._form}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={saveProfile.isPending} disabled={name.trim() === user.name}>
              Speichern
            </Button>
          </div>
        </form>
      </Card>

      <AppearanceCard preference={theme.preference} onChange={theme.setPreference} />

      <PasswordCard hasPassword={user.hasPassword} />

      <ConnectedAccountsCard hasPassword={user.hasPassword} />

      <SessionsCard />

      <Card padding="lg">
        <CardHeader title="Abmelden" description="Beendet die Sitzung auf diesem Gerät." />
        <Button
          variant="secondary"
          leftIcon={<LogOut className="size-4" />}
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Abmelden
        </Button>
      </Card>
    </div>
  );
}

const themeOptions: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
];

function AppearanceCard({
  preference,
  onChange,
}: {
  preference: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <Card padding="lg">
      <CardHeader title="Aussehen" description="Folgt standardmäßig deinem Systemdesign." />
      <div className="grid grid-cols-3 gap-2">
        {themeOptions.map((option) => {
          const active = option.value === preference;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={
                active
                  ? "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-brand bg-brand-soft text-sm font-medium text-brand-soft-fg"
                  : "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-sm text-fg-muted hover:bg-surface-2"
              }
            >
              <option.icon className="size-5" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        newPassword,
        ...(hasPassword ? { currentPassword } : {}),
      };
      const result = validate(ChangePasswordRequestSchema, payload);
      if (!result.ok) {
        setErrors(result.errors);
        return Promise.reject(new Error(result.errors.newPassword ?? "Eingaben prüfen"));
      }
      return changePassword(result.data);
    },
    onSuccess: () => {
      setErrors({});
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Passwort aktualisiert");
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  return (
    <Card padding="lg">
      <CardHeader
        title={hasPassword ? "Passwort ändern" : "Passwort festlegen"}
        description={
          hasPassword
            ? "Mindestens 8 Zeichen."
            : "Dein Konto nutzt bisher nur die Anmeldung über Google/GitHub."
        }
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {errors._form ? <ErrorState inline description={errors._form} /> : null}
        {hasPassword ? (
          <PasswordInput
            label="Aktuelles Passwort"
            autoComplete="current-password"
            value={currentPassword}
            error={errors.currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
          />
        ) : null}
        <PasswordInput
          label="Neues Passwort"
          autoComplete="new-password"
          value={newPassword}
          error={errors.newPassword}
          onChange={(event) => setNewPassword(event.currentTarget.value)}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending} disabled={newPassword.length === 0}>
            {hasPassword ? "Passwort ändern" : "Passwort festlegen"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * "Google/GitHub verknüpfen".
 *
 * This is the ONLY way a password account and an OAuth identity end up on one
 * user: the API deliberately no longer links them automatically when the
 * addresses match, because self-registration cannot prove address ownership and
 * auto-linking made pre-registering someone else's e-mail a full account
 * takeover. See services/auth/oauthAccounts.ts.
 */
function ConnectedAccountsCard({ hasPassword }: { hasPassword: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const search = useSearchParams();
  const providers = useQuery(oauthProvidersQuery());
  const [pendingUnlink, setPendingUnlink] = useState<OAuthProviderStatus | null>(null);

  // The link round-trip comes back as /settings?linked=google (or ?error=…).
  const linked = search.linked;
  const linkError = search.error;
  useEffect(() => {
    if (linked) {
      toast.success(`${PROVIDER_LABELS[linked] ?? linked} verknüpft`);
      void invalidate.oauthProviders(queryClient);
    } else if (linkError) {
      toast.error(oauthLinkErrorMessage(linkError));
    }
    // Only react to the query string, not to the freshly created callbacks.
  }, [linked, linkError]);

  const unlink = useMutation({
    mutationFn: (provider: OAuthProvider) => unlinkOAuthProvider(provider),
    onSuccess: async () => {
      await invalidate.oauthProviders(queryClient);
      toast.success("Verknüpfung getrennt");
    },
    onError: (error) => toast.fromError(error, "Trennen fehlgeschlagen"),
  });

  const configured = (providers.data?.providers ?? []).filter((entry) => entry.configured);
  if (providers.isPending) return null;
  if (configured.length === 0) {
    return (
      <Card padding="lg">
        <CardHeader
          title="Verknüpfte Konten"
          description="Auf diesem Server ist keine Anmeldung über Google oder GitHub konfiguriert."
        />
      </Card>
    );
  }

  const linkedCount = configured.filter((entry) => entry.linked).length;

  return (
    <Card padding="lg">
      <CardHeader
        title="Verknüpfte Konten"
        description="Verknüpfe einen Anbieter, um dich künftig auch damit anzumelden."
      />
      <ul className="flex flex-col divide-y divide-line">
        {configured.map((entry) => {
          // Never let the user remove their last way in.
          const isLastMethod = entry.linked && linkedCount === 1 && !hasPassword;
          return (
            <li key={entry.provider} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-fg">{PROVIDER_LABELS[entry.provider]}</p>
                <p className="truncate text-fg-muted">
                  {entry.linked
                    ? (entry.linkedEmail ?? "verknüpft")
                    : "nicht verknüpft"}
                </p>
              </div>
              {entry.linked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLastMethod}
                  title={
                    isLastMethod ? "Lege zuerst ein Passwort fest." : undefined
                  }
                  leftIcon={<Link2Off className="size-4" />}
                  onClick={() => setPendingUnlink(entry)}
                >
                  Trennen
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Link2 className="size-4" />}
                  onClick={() => startOAuthLink(entry.provider)}
                >
                  Verknüpfen
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingUnlink !== null}
        onClose={() => setPendingUnlink(null)}
        title="Verknüpfung trennen?"
        description="Du kannst dich danach nicht mehr über diesen Anbieter anmelden."
        confirmLabel="Trennen"
        destructive
        onConfirm={async () => {
          if (pendingUnlink) await unlink.mutateAsync(pendingUnlink.provider);
        }}
      />
    </Card>
  );
}

const PROVIDER_LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

function oauthLinkErrorMessage(code: string): string {
  if (code === "oauth_already_linked") {
    return "Dieses Anbieter-Konto ist bereits mit einem anderen Nutzer verknüpft.";
  }
  if (code === "oauth_not_configured") {
    return "Dieser Anbieter ist auf dem Server nicht konfiguriert.";
  }
  return "Die Verknüpfung ist fehlgeschlagen. Bitte erneut versuchen.";
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sessions = useQuery(sessionsQuery());
  const [pendingRevoke, setPendingRevoke] = useState<SessionInfo | null>(null);

  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: async () => {
      await invalidate.sessions(queryClient);
      toast.success("Gerät abgemeldet");
    },
    onError: (error) => toast.fromError(error, "Abmelden fehlgeschlagen"),
  });

  return (
    <Card padding="lg">
      <CardHeader
        title="Angemeldete Geräte"
        description="Sitzungen laufen nach 30 Tagen Inaktivität automatisch ab."
      />
      {sessions.isPending ? (
        <Skeleton lines={3} />
      ) : sessions.isError ? (
        <ErrorState
          inline
          error={sessions.error}
          onRetry={() => {
            void sessions.refetch();
          }}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {sessions.data.items.map((session) => (
            <li key={session.id} className="flex items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted"
              >
                <Smartphone className="size-5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-2 font-medium text-fg">
                  {truncate(session.userAgent ?? "Unbekanntes Gerät", 42)}
                  {session.current ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-soft-fg">
                      <Check className="size-3" aria-hidden="true" />
                      Dieses Gerät
                    </span>
                  ) : null}
                </p>
                <p className="text-fg-muted">
                  Zuletzt aktiv {formatRelative(session.lastUsedAt)} · angemeldet am{" "}
                  {formatDateTime(session.createdAt)}
                </p>
              </div>
              {!session.current ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="size-4" />}
                  onClick={() => setPendingRevoke(session)}
                >
                  Abmelden
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        title="Gerät abmelden?"
        description="Die Sitzung wird sofort beendet."
        confirmLabel="Abmelden"
        destructive
        onConfirm={async () => {
          if (pendingRevoke) await revoke.mutateAsync(pendingRevoke.id);
        }}
      />
    </Card>
  );
}

export default AccountSettingsPage;
