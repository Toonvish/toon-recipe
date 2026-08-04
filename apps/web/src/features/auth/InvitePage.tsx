import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Users } from "lucide-react";
import type { AcceptInviteResponse } from "@toon/shared";
import { acceptInvite } from "@/lib/api";
import { formatDate, roleLabels } from "@/lib/format";
import { invalidate, invitePreviewQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useGoTo } from "@/lib/navigation";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { AuthLayout } from "./AuthLayout";

/**
 * `/invite/$token` — public landing page for an invite link.
 * Logged in: one tap to join, then the group becomes the active one.
 * Logged out: register (e-mail is pre-filled) or sign in first.
 */
export function InvitePage() {
  const params = useParams({ strict: false }) as { token?: string };
  const token = params.token ?? "";
  const queryClient = useQueryClient();
  const toast = useToast();
  const goTo = useGoTo();
  const { isAuthenticated, isLoading, setActiveGroup } = useSession();

  const preview = useQuery({ ...invitePreviewQuery(token), enabled: token.length > 0 });

  const join = useMutation<AcceptInviteResponse, unknown, void>({
    mutationFn: () => acceptInvite({ token }),
    onSuccess: async (data) => {
      await Promise.all([invalidate.me(queryClient), invalidate.groups(queryClient)]);
      setActiveGroup(data.group.id);
      toast.success("Willkommen!", `Du bist jetzt Mitglied von „${data.group.name}“.`);
      goTo("/", { replace: true });
    },
    onError: (error) => toast.fromError(error, "Beitreten fehlgeschlagen"),
  });

  if (token.length === 0) {
    return (
      <AuthLayout title="Einladung">
        <ErrorState title="Ungültiger Link" description="In diesem Link fehlt der Einladungscode." />
      </AuthLayout>
    );
  }

  if (preview.isPending || isLoading) {
    return (
      <AuthLayout title="Einladung">
        <LoadingBlock label="Einladung wird geprüft …" />
      </AuthLayout>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <AuthLayout title="Einladung">
        <ErrorState
          error={preview.error}
          title="Einladung nicht gültig"
          description="Der Link ist abgelaufen oder wurde zurückgezogen. Bitte lass dir eine neue Einladung schicken."
          action={
            <Link to="/login" className={buttonClasses({ variant: "secondary" })}>
              Zur Anmeldung
            </Link>
          }
        />
      </AuthLayout>
    );
  }

  const invite = preview.data;
  const usable = invite.status === "pending";

  return (
    <AuthLayout
      title="Du wurdest eingeladen"
      description={`${invite.invitedByName} lädt dich zu „${invite.groupName}“ ein.`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg"
          >
            <Users className="size-5" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-fg">{invite.groupName}</p>
            <p className="text-fg-muted">
              Rolle: {roleLabels[invite.role]} · Einladung für {invite.email}
            </p>
            <p className="text-fg-muted">Gültig bis {formatDate(invite.expiresAt)}</p>
          </div>
        </div>

        {!usable ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-soft-fg"
          >
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              {invite.status === "accepted"
                ? "Diese Einladung wurde bereits angenommen."
                : invite.status === "expired"
                  ? "Diese Einladung ist abgelaufen."
                  : "Diese Einladung wurde zurückgezogen."}
            </p>
          </div>
        ) : null}

        {isAuthenticated ? (
          <Button
            size="lg"
            fullWidth
            disabled={!usable}
            loading={join.isPending}
            onClick={() => join.mutate()}
          >
            Gruppe beitreten
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Link
              to="/register"
              search={{ invite: token }}
              className={buttonClasses({ size: "lg", fullWidth: true })}
            >
              Konto anlegen und beitreten
            </Link>
            <Link
              to="/login"
              search={{ next: `/invite/${token}` }}
              className={buttonClasses({ variant: "secondary", size: "lg", fullWidth: true })}
            >
              Ich habe schon ein Konto
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

export default InvitePage;
