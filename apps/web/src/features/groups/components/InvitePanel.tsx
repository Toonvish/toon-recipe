/**
 * Invite panel (admins/owners only): create an invite by e-mail, copy the ready-made
 * link, and see/revoke pending invites.
 *
 * The API returns `inviteUrl` (built from WEB_ORIGIN) plus the raw token, so the link can
 * be shared through any channel — the app itself does not send e-mails.
 */
import { useState } from "react";
import { Copy, Link2, MailPlus, Share2, Undo2 } from "lucide-react";
import { CreateInviteRequestSchema, type GroupInvite, type InvitableRole } from "@toon/shared";
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

export function InvitePanel({ groupId, groupName, enabled }: InvitePanelProps) {
  const invites = useGroupInvites(groupId, enabled);
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastUrl, setLastUrl] = useState<string | null>(null);

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
      const copied = await copyToClipboard(response.inviteUrl);
      toast.success(
        "Einladung erstellt",
        copied
          ? "Der Link ist in der Zwischenablage."
          : "Kopiere den Link unten und schicke ihn weiter.",
      );
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
            Es wird keine E-Mail verschickt — du bekommst einen Link, den du selbst weitergibst.
            Er ist 14 Tage gültig.
          </p>
        </form>

        {lastUrl ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-success/40 bg-success-soft p-3">
            <p className="text-sm font-medium text-success-soft-fg">Neuer Einladungslink</p>
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
