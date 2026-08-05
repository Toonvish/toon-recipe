import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Link2,
  Link2Off,
  LogOut,
  MailWarning,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import {
  ChangePasswordRequestSchema,
  UpdateProfileRequestSchema,
  type OAuthProvider,
  type OAuthProviderStatus,
  type SessionInfo,
} from "@toon/shared";
import {
  changePassword,
  requestEmailVerification,
  revokeSession,
  startOAuthLink,
  unlinkOAuthProvider,
  updateProfile,
} from "@/lib/api";
import { formatDateTime, formatRelative, truncate } from "@/lib/format";
import { invalidate, oauthProvidersQuery, sessionsQuery } from "@/lib/queries";
import { useSearchParams } from "@/lib/navigation";
import { useActiveGroup, useCurrentUser, useLogout, useSession } from "@/lib/session";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { PageHeader } from "@/components/layout/AppShell";
import { AppLink } from "@/features/recipes/lib/nav";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { plural } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

/**
 * `/settings` — profile, groups, password, appearance and active sessions.
 *
 * This is the auth-owned fallback screen; a dedicated settings page under
 * `src/features/settings/SettingsPage.tsx` takes precedence if one exists.
 *
 * GROUPS LIVE HERE, and on a phone this is the ONLY way to reach them: "Gruppen" is no
 * longer a bottom-tab destination (see components/layout/nav-items.ts), and the sidebar
 * that also lists it does not exist below `lg`. If the card below is removed, group
 * management becomes unreachable on mobile.
 */
export function AccountSettingsPage() {
  const user = useCurrentUser();
  const { refetch, groups } = useSession();
  // `useActiveGroup()` resolves the persisted choice; `groups` is only the count.
  const { group: activeGroup } = useActiveGroup();
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
      <PageHeader
        title="Profil"
        description="Konto, Gruppen, Aussehen und angemeldete Geräte."
      />

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

      <GroupsCard count={groups.length} activeGroupName={activeGroup?.name ?? null} />

      <EmailVerificationCard
        email={user.email}
        verified={user.emailVerified}
        verifiedAt={user.emailVerifiedAt ?? null}
      />

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

/**
 * "E-Mail bestätigen".
 *
 * Confirming is worth something concrete — it is what makes a mailed password reset
 * trustworthy — but it is NOT a switch that re-enables OAuth auto-linking. The API
 * still answers 409 `email_taken` for a provider login on a taken address; see
 * apps/api/src/services/auth/oauthAccounts.ts for the takeover that prevents.
 */
/**
 * Entry point to group management. Deliberately a LINK, not an inlined group editor: the
 * `/groups` screen already owns members, invites and roles, and duplicating it here would
 * be a second implementation of the same rules.
 *
 * The active group is named because that is what a member actually wonders on this screen
 * ("which group am I adding recipes to?") — switching it is still the `GroupSwitcher` in
 * the top bar, which is where it belongs.
 */
function GroupsCard({
  count,
  activeGroupName,
}: {
  count: number;
  activeGroupName: string | null;
}) {
  return (
    <Card padding="lg">
      <CardHeader
        title="Gruppen"
        description={
          count === 0
            ? "Du bist noch in keiner Gruppe."
            : `${plural(count, "Gruppe", "Gruppen")}${activeGroupName ? ` · aktiv: ${activeGroupName}` : ""}`
        }
      />
      <AppLink
        to="/groups"
        className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-fg transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Users aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">Gruppen verwalten</span>
          <span className="text-xs text-fg-muted">
            Mitglieder, Einladungen und Rollen
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
      </AppLink>
    </Card>
  );
}

function EmailVerificationCard({
  email,
  verified,
  verifiedAt,
}: {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
}) {
  const toast = useToast();
  const [sent, setSent] = useState(false);

  const requestLink = useMutation({
    mutationFn: () => requestEmailVerification(),
    /*
      A 2xx here means "the token exists", NOT "the mail is on its way": the send
      happens after the row is written and never fails the request (trySendMail).
      So the copy follows `mailDelivery` — announcing a mail that the server only
      wrote to its log, or that a relay refused, is worse than saying nothing,
      because the user then waits for it instead of asking the admin.
    */
    onSuccess: (result) => {
      if (result.mailDelivery === "sent") {
        setSent(true);
        toast.success("E-Mail unterwegs", `Wir haben einen Bestätigungslink an ${email} geschickt.`);
        return;
      }
      setSent(false);
      toast.toast({
        title: "Keine E-Mail verschickt",
        description:
          result.mailDelivery === "not_configured"
            ? "Auf diesem Server ist kein Mailversand eingerichtet. Der Bestätigungslink steht im Server-Log."
            : "Die Zustellung ist fehlgeschlagen. Bitte später erneut versuchen — Details stehen im Server-Log.",
        variant: result.mailDelivery === "not_configured" ? "warning" : "error",
      });
    },
    onError: (error) => {
      const errors = apiFieldErrors(error);
      toast.error("Konnte nicht verschickt werden", errors._form ?? "Bitte später erneut versuchen.");
    },
  });

  if (verified) {
    return (
      <Card padding="lg">
        <CardHeader
          title="E-Mail-Adresse"
          description={
            verifiedAt === null
              ? "Bestätigt."
              : `Bestätigt am ${formatDateTime(verifiedAt)}.`
          }
        />
        <p className="flex items-center gap-2 text-sm text-success-soft-fg">
          <BadgeCheck aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 break-all">{email}</span>
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <CardHeader
        title="E-Mail-Adresse bestätigen"
        description="Noch nicht bestätigt."
      />
      <div className="flex flex-col gap-3">
        {/*
          The sentence is ONE child. Left bare, the icon, the text runs and the <strong>
          were four flex items: each got the container's gap, each wrapped on its own, and
          the address ended up in a ~60px column broken as "smoke / @toon. / test" with the
          comma orphaned on the next line. Same trap as the hint on /import.
        */}
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <MailWarning aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Bestätige <strong className="font-medium break-words text-fg">{email}</strong>, damit du
            dein Passwort per E-Mail zurücksetzen kannst.
          </span>
        </p>
        <div className="flex justify-start">
          <Button
            variant="secondary"
            loading={requestLink.isPending}
            onClick={() => requestLink.mutate()}
          >
            {sent ? "Erneut senden" : "Bestätigungslink senden"}
          </Button>
        </div>
      </div>
    </Card>
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
