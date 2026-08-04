/**
 * Row -> contract mappers for groups, members and invites.
 * Timestamps become ISO strings here and nowhere else.
 */
import type {
  Group,
  GroupInvite,
  GroupMember,
  GroupRole,
  GroupWithRole,
  InvitableRole,
  InviteStatus,
  PublicUser,
} from "@toon/shared";
import type { GroupInviteRow, GroupMemberRow, GroupRow, UserRow } from "../../db/schema.ts";
import { toIso, toIsoOrNull } from "../../lib/http.ts";
import { signUploadUrl } from "../../lib/uploadUrls.ts";
import { toGroupRole } from "./membership.ts";

export function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    // Signed on the way out — see toRecipe() and lib/uploadUrls.ts.
    imageUrl: signUploadUrl(row.imageUrl),
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toGroupWithRole(
  row: GroupRow,
  role: GroupRole,
  memberCount: number,
  recipeCount: number,
): GroupWithRole {
  return { ...toGroup(row), role, memberCount, recipeCount };
}

export function toPublicUser(row: Pick<UserRow, "id" | "name" | "email" | "avatarUrl">): PublicUser {
  return { id: row.id, name: row.name, email: row.email, avatarUrl: signUploadUrl(row.avatarUrl) };
}

export function toGroupMember(
  row: GroupMemberRow,
  user: Pick<UserRow, "id" | "name" | "email" | "avatarUrl">,
): GroupMember {
  return {
    id: row.id,
    groupId: row.groupId,
    userId: row.userId,
    role: toGroupRole(row.role),
    createdAt: toIso(row.createdAt),
    user: toPublicUser(user),
  };
}

/** Invites can only ever hand out admin/member (never owner). */
export function toInvitableRole(value: string): InvitableRole {
  return value === "admin" ? "admin" : "member";
}

export function toInviteStatus(value: string, expiresAt: number, now = Date.now()): InviteStatus {
  if (value === "accepted" || value === "revoked") return value;
  if (value === "expired" || expiresAt <= now) return "expired";
  return "pending";
}

export function toGroupInvite(row: GroupInviteRow, invitedByName: string): GroupInvite {
  return {
    id: row.id,
    groupId: row.groupId,
    email: row.email,
    role: toInvitableRole(row.role),
    token: row.token,
    status: toInviteStatus(row.status, row.expiresAt),
    invitedBy: row.invitedBy,
    invitedByName,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt),
    acceptedAt: toIsoOrNull(row.acceptedAt),
  };
}
