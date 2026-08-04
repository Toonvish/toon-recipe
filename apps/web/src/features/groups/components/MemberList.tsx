/**
 * Member list with role controls.
 *
 * Rules mirrored from docs/API.md (the API enforces them, this only hides the controls):
 *  - admins may change roles, but only an OWNER may grant `owner` (= ownership transfer,
 *    the previous owner becomes admin)
 *  - the last owner can neither be demoted nor removed (409 `last_owner`)
 *  - every member may remove themselves ("Gruppe verlassen")
 */
import { useState } from "react";
import { LogOut, UserMinus } from "lucide-react";
import type { GroupMember, GroupRole } from "@toon/shared";
import { Avatar, Badge, Button, ConfirmDialog, Select } from "@/components/ui";
import { useToast } from "@/components/ui";
import { roleLabels } from "@/lib/format";
import { hasAtLeast } from "@/features/recipes/lib/permissions";
import { useChangeMemberRole, useRemoveMember } from "../lib/queries";

export interface MemberListProps {
  groupId: string;
  members: readonly GroupMember[];
  /** Role of the CURRENT user in this group. */
  myRole: GroupRole | null;
  myUserId: string;
  /** Called after the current user left the group. */
  onLeft: () => void;
}

const ROLE_OPTIONS: ReadonlyArray<{ value: GroupRole; label: string }> = [
  { value: "member", label: roleLabels.member },
  { value: "admin", label: roleLabels.admin },
  { value: "owner", label: roleLabels.owner },
];

export function MemberList({ groupId, members, myRole, myUserId, onLeft }: MemberListProps) {
  const changeRole = useChangeMemberRole();
  const removeMember = useRemoveMember();
  const toast = useToast();
  const [pendingRemoval, setPendingRemoval] = useState<GroupMember | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const isAdmin = hasAtLeast(myRole, "admin");
  const isOwner = myRole === "owner";
  const ownerCount = members.filter((member) => member.role === "owner").length;

  async function setRole(member: GroupMember, role: GroupRole) {
    if (role === member.role) return;
    try {
      await changeRole.mutateAsync({ groupId, userId: member.userId, role });
      toast.success(
        role === "owner" ? "Besitz übertragen" : "Rolle geändert",
        `${member.user.name}: ${roleLabels[role]}`,
      );
    } catch (error) {
      toast.fromError(error, "Rolle konnte nicht geändert werden");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line">
        {members.map((member) => {
          const isMe = member.userId === myUserId;
          const isLastOwner = member.role === "owner" && ownerCount === 1;
          // Only an owner may hand out `owner`; nobody may demote the last owner.
          const canChangeRole = isAdmin && !isLastOwner;
          const canRemove = (isAdmin || isMe) && !isLastOwner;

          return (
            <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={member.user.name} src={member.user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                  <span className="truncate">{member.user.name}</span>
                  {isMe ? <Badge variant="brand">Du</Badge> : null}
                  {isLastOwner ? <Badge variant="neutral">Einzige:r Besitzer:in</Badge> : null}
                </p>
                <p className="truncate text-sm text-fg-muted">{member.user.email}</p>
              </div>

              {canChangeRole ? (
                <Select
                  aria-label={`Rolle von ${member.user.name}`}
                  options={ROLE_OPTIONS.filter(
                    (option) => option.value !== "owner" || isOwner,
                  )}
                  value={member.role}
                  disabled={changeRole.isPending}
                  onChange={(event) => void setRole(member, event.target.value as GroupRole)}
                  containerClassName="w-44"
                />
              ) : (
                <Badge variant={member.role === "owner" ? "brand" : "neutral"}>
                  {roleLabels[member.role]}
                </Badge>
              )}

              {canRemove ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (isMe ? setLeaveOpen(true) : setPendingRemoval(member))}
                  leftIcon={isMe ? <LogOut className="size-4" /> : <UserMinus className="size-4" />}
                  className="text-danger"
                >
                  {isMe ? "Verlassen" : "Entfernen"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        destructive
        title="Mitglied entfernen?"
        description={
          pendingRemoval
            ? `${pendingRemoval.user.name} verliert den Zugriff auf alle Rezepte dieser Gruppe. Von ${pendingRemoval.user.name} angelegte Rezepte bleiben erhalten.`
            : undefined
        }
        confirmLabel="Entfernen"
        onConfirm={async () => {
          if (!pendingRemoval) return;
          try {
            await removeMember.mutateAsync({ groupId, userId: pendingRemoval.userId });
            toast.success("Mitglied entfernt", pendingRemoval.user.name);
          } catch (error) {
            toast.fromError(error, "Entfernen fehlgeschlagen");
            throw error;
          }
        }}
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        destructive
        title="Gruppe verlassen?"
        description="Du verlierst den Zugriff auf alle Rezepte, Tags und Sammlungen dieser Gruppe. Eine erneute Einladung ist jederzeit möglich."
        confirmLabel="Verlassen"
        onConfirm={async () => {
          try {
            await removeMember.mutateAsync({ groupId, userId: myUserId });
            toast.success("Gruppe verlassen");
            onLeft();
          } catch (error) {
            toast.fromError(error, "Verlassen fehlgeschlagen");
            throw error;
          }
        }}
      />
    </div>
  );
}
