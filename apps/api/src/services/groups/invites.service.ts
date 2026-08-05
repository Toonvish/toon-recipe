/**
 * Group invites.
 *
 * `POST /api/groups/:groupId/invites` mails the link AND returns it. The mail is a
 * convenience; the returned `inviteUrl` is the source of truth, because a
 * self-hosted install may well have no MAIL_TRANSPORT at all (then the
 * ConsoleMailer logs it) and because a provider outage must not stop an admin from
 * inviting somebody over WhatsApp. `mailDelivery` in the response says which of the
 * three happened, so the UI can tell "forward it yourself" apart from "your relay
 * is broken" instead of calling both a success.
 *
 * The token IS the secret, so anybody holding the link may accept it (a person
 * often registers with a different address than the one they were invited with).
 */
import type {
  AcceptInviteResponse,
  GroupInvite,
  GroupInviteListResponse,
  GroupInviteResponse,
  GroupRole,
  InvitePreviewResponse,
  PaginationQuery,
} from "@toon/shared";
import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { groupInvites, groupMembers, groups, users } from "../../db/schema.ts";
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import { toIso } from "../../lib/http.ts";
import { inviteMail, mailDeliveryOf, trySendMail } from "../mail/index.ts";
import { getGroupWithRole, getMember } from "./groups.service.ts";
import { toGroupInvite, toInvitableRole, toInviteStatus } from "./mappers.ts";
import { toGroupRole } from "./membership.ts";
import { type DbLike, eqFolded, nowMs, withTransaction } from "./support.ts";

/** Invite lifetime — docs/API.md: 32-byte token, 14 days. */
export const INVITE_TTL_DAYS = 14;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** 32 random bytes, URL-safe base64 (43 chars). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/** `${WEB_ORIGIN}/invite/<token>` — the link the admin copies. */
export function buildInviteUrl(token: string): string {
  const origin = env.webOrigins[0] ?? "";
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/* -------------------------------------------------------------------------- */
/* admin side                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates an invite. Any older pending invite for the same (group, e-mail) is
 * revoked in the same transaction so only the newest link works.
 */
export async function createInvite(
  db: Database,
  groupId: string,
  invitedBy: string,
  input: { email: string; role: "admin" | "member" },
): Promise<GroupInviteResponse> {
  const alreadyMember = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eqFolded(users.email, input.email)))
    .limit(1);
  if (alreadyMember.length > 0) {
    throw ApiError.conflict("conflict", "Diese Person ist schon Mitglied der Gruppe");
  }

  const timestamp = nowMs();
  const id = crypto.randomUUID();
  const token = generateInviteToken();

  await withTransaction(db, async (tx) => {
    await tx
      .update(groupInvites)
      .set({ status: "revoked" })
      .where(
        and(
          eq(groupInvites.groupId, groupId),
          eq(groupInvites.status, "pending"),
          eqFolded(groupInvites.email, input.email),
        ),
      );
    await tx.insert(groupInvites).values({
      id,
      groupId,
      email: input.email,
      role: input.role,
      token,
      status: "pending",
      invitedBy,
      expiresAt: timestamp + INVITE_TTL_MS,
      createdAt: timestamp,
    });
  });

  const invite = await loadInvite(db, { inviteId: id });
  const inviteUrl = buildInviteUrl(token);

  // AFTER the row is committed, and never able to fail the request: an invite that
  // exists but was not mailed is useful (copy the link); a 500 that leaves a
  // committed invite behind is not. trySendMail() swallows and logs.
  const [group] = await db
    .select({ name: groups.name })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  const sent = await trySendMail(
    inviteMail({
      to: input.email,
      groupName: group?.name ?? "Rezepte",
      invitedByName: invite.invitedByName,
      inviteUrl,
      expiresInDays: INVITE_TTL_DAYS,
    }),
  );

  // `sent.delivered` is TRUE for the ConsoleMailer (it logged the link, which is
  // all it promises), so it cannot be `emailSent` on its own — that is what made
  // the invite panel announce a mail on an install with no MAIL_TRANSPORT.
  const mailDelivery = mailDeliveryOf(sent);
  return { invite, inviteUrl, emailSent: mailDelivery === "sent", mailDelivery };
}

/** One invite in contract shape, resolved by id or token. */
async function loadInvite(
  db: DbLike,
  selector: { inviteId?: string; token?: string },
): Promise<GroupInvite> {
  const where = selector.inviteId
    ? eq(groupInvites.id, selector.inviteId)
    : eq(groupInvites.token, selector.token ?? "");
  const [row] = await db
    .select({ invite: groupInvites, invitedByName: users.name })
    .from(groupInvites)
    .innerJoin(users, eq(users.id, groupInvites.invitedBy))
    .where(where)
    .limit(1);
  if (!row) throw ApiError.notFound("Einladung nicht gefunden");
  return toGroupInvite(row.invite, row.invitedByName);
}

/** Paginated invite list for admins (tokens included so links can be re-copied). */
export async function listInvites(
  db: DbLike,
  groupId: string,
  pagination: PaginationQuery,
): Promise<GroupInviteListResponse> {
  const rows = await db
    .select({ invite: groupInvites, invitedByName: users.name })
    .from(groupInvites)
    .innerJoin(users, eq(users.id, groupInvites.invitedBy))
    .where(eq(groupInvites.groupId, groupId))
    .orderBy(desc(groupInvites.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset);

  const [totals] = await db
    .select({ value: count() })
    .from(groupInvites)
    .where(eq(groupInvites.groupId, groupId));

  return {
    items: rows.map((row) => toGroupInvite(row.invite, row.invitedByName)),
    total: Number(totals?.value ?? 0),
    limit: pagination.limit,
    offset: pagination.offset,
  };
}

/** Revokes a pending invite (idempotent for already revoked ones). */
export async function revokeInvite(db: DbLike, groupId: string, inviteId: string): Promise<void> {
  const [row] = await db
    .select({ id: groupInvites.id, status: groupInvites.status })
    .from(groupInvites)
    .where(and(eq(groupInvites.id, inviteId), eq(groupInvites.groupId, groupId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Einladung nicht gefunden");
  if (row.status === "accepted") {
    throw ApiError.conflict("conflict", "Diese Einladung wurde schon angenommen");
  }
  await db.update(groupInvites).set({ status: "revoked" }).where(eq(groupInvites.id, inviteId));
}

/* -------------------------------------------------------------------------- */
/* invitee side                                                               */
/* -------------------------------------------------------------------------- */

interface InviteContext {
  invite: typeof groupInvites.$inferSelect;
  groupName: string;
  invitedByName: string;
}

/** Loads an invite by token and rejects unusable ones (404/409). */
async function loadUsableInvite(db: DbLike, token: string): Promise<InviteContext> {
  const [row] = await db
    .select({ invite: groupInvites, groupName: groups.name, invitedByName: users.name })
    .from(groupInvites)
    .innerJoin(groups, eq(groups.id, groupInvites.groupId))
    .innerJoin(users, eq(users.id, groupInvites.invitedBy))
    .where(eq(groupInvites.token, token))
    .limit(1);

  if (!row) throw ApiError.notFound("Diese Einladung ist ungültig");
  const status = toInviteStatus(row.invite.status, row.invite.expiresAt);
  if (status === "revoked") throw ApiError.notFound("Diese Einladung wurde zurückgezogen");
  if (status === "expired") {
    throw ApiError.conflict("invite_expired", "Diese Einladung ist abgelaufen");
  }
  return { invite: row.invite, groupName: row.groupName, invitedByName: row.invitedByName };
}

/** Public landing-page preview ("Du wurdest zu <Gruppe> eingeladen"). */
export async function previewInvite(db: DbLike, token: string): Promise<InvitePreviewResponse> {
  const { invite, groupName, invitedByName } = await loadUsableInvite(db, token);
  return {
    groupName,
    invitedByName,
    email: invite.email,
    role: toInvitableRole(invite.role),
    status: toInviteStatus(invite.status, invite.expiresAt),
    expiresAt: toIso(invite.expiresAt),
  };
}

/**
 * Accepts an invite: the caller becomes a member with the invited role, the
 * invite is marked accepted and the group becomes the caller's active group.
 * Accepting twice is idempotent when the caller already is a member.
 */
export async function acceptInvite(
  db: Database,
  userId: string,
  token: string,
): Promise<AcceptInviteResponse> {
  const { invite } = await loadUsableInvite(db, token);

  const [existing] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, invite.groupId), eq(groupMembers.userId, userId)))
    .limit(1);

  const timestamp = nowMs();

  if (!existing && invite.status === "accepted") {
    throw ApiError.notFound("Diese Einladung wurde bereits verwendet");
  }

  const role: GroupRole = existing ? toGroupRole(existing.role) : toInvitableRole(invite.role);

  await withTransaction(db, async (tx) => {
    if (!existing) {
      await tx.insert(groupMembers).values({
        id: crypto.randomUUID(),
        groupId: invite.groupId,
        userId,
        role,
        createdAt: timestamp,
      });
    }
    await tx
      .update(groupInvites)
      .set({ status: "accepted", acceptedBy: userId, acceptedAt: timestamp })
      .where(eq(groupInvites.id, invite.id));
    await tx
      .update(users)
      .set({ activeGroupId: invite.groupId, updatedAt: timestamp })
      .where(eq(users.id, userId));
  });

  const [group, member] = await Promise.all([
    getGroupWithRole(db, invite.groupId, role),
    getMember(db, invite.groupId, userId),
  ]);

  return { group, member };
}
