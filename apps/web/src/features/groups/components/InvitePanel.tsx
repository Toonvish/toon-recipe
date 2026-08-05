/**
 * Invite panel (admins/owners only): create an invite by e-mail, copy the ready-made
 * link, and see/revoke pending invites.
 *
 * The API mails the link AND returns it: `inviteUrl` (built from WEB_ORIGIN) plus the
 * raw token, so it can also be shared through any other channel. `mailDelivery` says
 * what became of the mail, and the panel has THREE outcomes rather than two: a
 * delivered mail is a success, "kein Mailversand eingerichtet" is a warning that the
 * link needs forwarding by hand, and a REFUSED delivery is an error — a configured
 * relay that rejects mail is a broken deployment, and an admin who is told "unterwegs"
 * has no reason to go and look. The invite itself is valid in all three cases, which
 * is why none of them hides the link.
 */
import { useState } from "react";
import { Copy, Link2, MailPlus, Share2, Undo2 } from "lucide-react";
import {
  CreateInviteRequestSchema,
  type GroupInvite,
  type GroupInviteResponse,
  type InvitableRole,
  type MailDelivery,
} from "@toon/shared";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/ui";
import { formatDate, roleLabels } from "@/lib/format";
import { apiFieldErrors, validate, type FieldErrors } from "@/lib/validation";
import { isApiError } from "@/lib/api";
import { copyToClipboard, shareOrCopy } from "@/features/recipes/lib/hooks";
import { INVITE_STATUS_LABELS, useCreateInvite, useGroupInvites, useRevokeInvite } from "../lib/queries";

export interface InvitePanelProps {
  groupId: string;
  groupName: string;
  /** Only admins/owners may list or create invites. */
  enabled: boolean;
}

const ROLE_OPTIONS: ReadonlyArray<{ value: InvitableRole; label: string }> = [
  { value: "member", label: roleLabels.member },
  { value: "admin", label: roleLabels.admin },
];

/** WEB_ORIGIN can differ from where the app is served; rebuild the link defensively. */
function inviteLink(invite: GroupInvite, fallbackUrl?: string): string {
  if (fallbackUrl && fallbackUrl.length > 0) return fallbackUrl;
  return `${window.location.origin}/invite/${invite.token}`;
}

/**
 * The server's three outcomes plus `unknown` for one that predates `mailDelivery` —
 * an installed PWA can be running a bundle newer than the API, and the old
 * `emailSent: false` genuinely cannot say which of the two non-deliveries it was.
 */
type InviteMailOutcome = MailDelivery | "unknown";

function outcomeOf(response: GroupInviteResponse): InviteMailOutcome {
  if (response.mailDelivery !== undefined) return response.mailDelivery;
  return response.emailSent === true ? "sent" : "unknown";
}

/**
 * How each outcome looks. `failed` is the ONLY one in danger colours: a configured
 * relay that refuses mail is a broken deployment and somebody has to look at the
 * log, whereas the other two are working setups. None of them hides the link —
 * the invite is valid in every case, which is the whole reason the API returns it.
 *
 * Every class here is a LITERAL string on purpose: Tailwind v4 generates only what
 * its scanner finds in the source, so a class assembled at runtime (`fg + "/90"`)
 * would resolve to nothing at all. Hence the spelled-out `hintFg`.
 */
const MAIL_OUTCOMES: Record<
  InviteMailOutcome,
  { box: string; fg: string; hintFg: string; title: string; hint: string | null }
> = {
  sent: {
    box: "border-success/40 bg-success-soft",
    fg: "text-success-soft-fg",
    hintFg: "text-success-soft-fg/90",
    title: "Einladung verschickt",
    hint: null,
  },
  not_configured: {
    box: "border-warning/40 bg-warning-soft",
    fg: "text-warning-soft-fg",
    hintFg: "text-warning-soft-fg/90",
    title: "Neuer Einladungslink — keine E-Mail",
    hint: "Auf diesem Server ist kein Mailversand eingerichtet. Schicke den Link bitte selbst weiter.",
  },
  failed: {
    box: "border-danger/40 bg-danger-soft",
    fg: "text-danger-soft-fg",
    hintFg: "text-danger-soft-fg/90",
    title: "E-Mail konnte nicht zugestellt werden",
    hint: "Der Mailversand ist eingerichtet, hat die Nachricht aber abgelehnt — der Grund steht im Server-Log. Die Einladung selbst ist gültig: schicke den Link bitte selbst weiter.",
  },
  unknown: {
    box: "border-warning/40 bg-warning-soft",
    fg: "text-warning-soft-fg",
    hintFg: "text-warning-soft-fg/90",
    title: "Neuer Einladungslink",
    hint: "Es wurde keine E-Mail verschickt. Schicke den Link bitte selbst weiter.",
  },
};

export function InvitePanel({ groupId, groupName, enabled }: InvitePanelProps) {
  const invites = useGroupInvites(groupId, enabled);
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<InviteMailOutcome>("unknown");

  if (!enabled) {
    return (
      <Card padding="md">
        <p className="text-sm text-fg-muted">
          Einladungen können nur Administrator:innen und Besitzer:innen verwalten.
        </p>
      </Card>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(CreateInviteRequestSchema, { email, role });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const response = await createInvite.mutateAsync({ groupId, ...result.data });
      setErrors({});
      setEmail("");
      setLastUrl(response.inviteUrl);
      const outcome = outcomeOf(response);
      setLastOutcome(outcome);
      const copied = await copyToClipboard(response.inviteUrl);
      // Creating the invite worked in every branch — only the MAIL differs, so the
      // toast reports the mail. Saying "Einladung erstellt" in success green while
      // the server refused to deliver is how a broken relay stays unnoticed.
      if (outcome === "sent") {
        toast.success("Einladung verschickt", `Eine E-Mail ist an ${result.data.email} unterwegs.`);
      } else {
        const fallback = copied
          ? "Der Link ist in der Zwischenablage."
          : "Kopiere den Link unten und schicke ihn weiter.";
        toast.toast({
          title:
            outcome === "failed"
              ? "E-Mail nicht zugestellt"
              : "Einladung erstellt — keine E-Mail",
          description:
            outcome === "failed"
              ? `Die Einladung für ${result.data.email} ist gültig, der Mailversand hat sie aber abgelehnt (Grund im Server-Log). ${fallback}`
              : fallback,
          variant: outcome === "failed" ? "error" : "warning",
        });
      }
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setErrors({ email: "Diese Person ist bereits Mitglied der Gruppe." });
        return;
      }
      setErrors(apiFieldErrors(error));
    }
  }

  const pending = (invites.data ?? []).filter((invite) => invite.status === "pending");
  const past = (invites.data ?? []).filter((invite) => invite.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <h3 className="font-medium text-fg">Person einladen</h3>
          {errors._form ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {errors._form}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
            <Input
              label="E-Mail-Adresse"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="oma@example.com"
              error={errors.email}
              disabled={createInvite.isPending}
            />
            <Select
              label="Rolle"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(event) => setRole(event.target.value as InvitableRole)}
              error={errors.role}
              disabled={createInvite.isPending}
            />
          </div>
          <Button
            type="submit"
            loading={createInvite.isPending}
            leftIcon={<MailPlus className="size-4" />}
            className="sm:self-start"
          >
            Einladungslink erstellen
          </Button>
          <p className="text-sm text-fg-muted">
            Wir verschicken eine E-Mail mit dem Einladungslink und zeigen dir den Link zusätzlich
            an, damit du ihn auch selbst weitergeben kannst. Er ist 14 Tage gültig.
          </p>
        </form>

        {lastUrl ? (
          <div
            className={`mt-3 flex flex-col gap-2 rounded-xl border p-3 ${MAIL_OUTCOMES[lastOutcome].box}`}
          >
            <p className={`text-sm font-medium ${MAIL_OUTCOMES[lastOutcome].fg}`}>
              {MAIL_OUTCOMES[lastOutcome].title}
            </p>
            {MAIL_OUTCOMES[lastOutcome].hint === null ? null : (
              <p className={`text-xs ${MAIL_OUTCOMES[lastOutcome].hintFg}`}>
                {MAIL_OUTCOMES[lastOutcome].hint}
              </p>
            )}
            <code className="block overflow-x-auto rounded-lg bg-surface p-2 text-xs text-fg">
              {lastUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Copy className="size-4" />}
                onClick={async () => {
                  const ok = await copyToClipboard(lastUrl);
                  if (ok) toast.success("Link kopiert");
                  else toast.error("Kopieren nicht möglich");
                }}
              >
                Kopieren
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Share2 className="size-4" />}
                onClick={async () => {
                  const result = await shareOrCopy({
                    title: `Einladung zu ${groupName}`,
                    text: `Du bist zu „${groupName}“ bei toon-recipe eingeladen:`,
                    url: lastUrl,
                  });
                  if (result === "copied") toast.success("Link kopiert");
                }}
              >
                Teilen
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-fg">Offene Einladungen</h3>
        {invites.isPending ? (
          <Skeleton lines={3} />
        ) : invites.isError ? (
          <ErrorState inline error={invites.error} onRetry={() => void invites.refetch()} />
        ) : pending.length === 0 ? (
          <p className="text-sm text-fg-muted">Keine offenen Einladungen.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{invite.email}</p>
                  <p className="text-sm text-fg-muted">
                    {roleLabels[invite.role]} · gültig bis {formatDate(invite.expiresAt)} · von{" "}
                    {invite.invitedByName}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Link2 className="size-4" />}
                  onClick={async () => {
                    const ok = await copyToClipboard(inviteLink(invite));
                    if (ok) toast.success("Link kopiert");
                    else toast.error("Kopieren nicht möglich");
                  }}
                >
                  Link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  leftIcon={<Undo2 className="size-4" />}
                  loading={revokeInvite.isPending}
                  onClick={async () => {
                    try {
                      await revokeInvite.mutateAsync({ groupId, inviteId: invite.id });
                      toast.success("Einladung zurückgezogen");
                    } catch (error) {
                      toast.fromError(error, "Zurückziehen fehlgeschlagen");
                    }
                  }}
                >
                  Zurückziehen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {past.length > 0 ? (
        <details className="rounded-card border border-line bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">
            Frühere Einladungen ({past.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {past.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {invite.email}
                </span>
                <Badge variant={invite.status === "accepted" ? "success" : "neutral"} size="sm">
                  {INVITE_STATUS_LABELS[invite.status] ?? invite.status}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
