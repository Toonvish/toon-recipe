/**
 * Groups + memberships.
 *
 * Every function takes the drizzle handle explicitly so it can run inside a
 * transaction and so tests can point it at an isolated in-memory database.
 * List endpoints never do N+1 queries: children/counts are fetched with a
 * single `inArray` query and joined in memory.
 */
import type {
  CreateGroupRequest,
  GroupMember,
  GroupRole,
  GroupWithRole,
  UpdateGroupRequest,
} from "@toon/shared";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { groupMembers, groups, recipes, users } from "../../db/schema.ts";
import type { GroupRow } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import type { Membership } from "../../lib/types.ts";
import { normalizeStoredUploadUrl } from "../../lib/uploadUrls.ts";
import { toGroupMember, toGroupWithRole } from "./mappers.ts";
import { assertRole, countOwners, toGroupRole } from "./membership.ts";
import { type DbLike, eqFolded, nowMs, toCountMap, withTransaction } from "./support.ts";

/* -------------------------------------------------------------------------- */
/* counts                                                                     */
/* -------------------------------------------------------------------------- */

/** memberCount per group — ONE grouped query for the whole page. */
async function memberCounts(db: DbLike, groupIds: readonly string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await db
    .select({ key: groupMembers.groupId, value: count() })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, [...groupIds]))
    .groupBy(groupMembers.groupId);
  return toCountMap(rows);
}

/** recipeCount per group — ONE grouped query for the whole page. */
async function recipeCounts(db: DbLike, groupIds: readonly string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await db
    .select({ key: recipes.groupId, value: count() })
    .from(recipes)
    .where(inArray(recipes.groupId, [...groupIds]))
    .groupBy(recipes.groupId);
  return toCountMap(rows);
}

/* -------------------------------------------------------------------------- */
/* reads                                                                      */
/* -------------------------------------------------------------------------- */

/** All groups the user belongs to, with their own role and both counts. */
export async function listGroupsForUser(db: DbLike, userId: string): Promise<GroupWithRole[]> {
  const rows = await db
    .select({ group: groups, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groups.name), asc(groups.createdAt));

  const ids = rows.map((row) => row.group.id);
  const [members, recipeTotals] = await Promise.all([memberCounts(db, ids), recipeCounts(db, ids)]);

  return rows.map((row) =>
    toGroupWithRole(
      row.group,
      toGroupRole(row.role),
      members.get(row.group.id) ?? 0,
      recipeTotals.get(row.group.id) ?? 0,
    ),
  );
}

/** The raw group row or a 404. */
export async function loadGroupRow(db: DbLike, groupId: string): Promise<GroupRow> {
  const [row] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!row) throw ApiError.notFound("server.group.notFound");
  return row;
}

/** A single group in the `GroupWithRole` shape used by every group response. */
export async function getGroupWithRole(
  db: DbLike,
  groupId: string,
  role: GroupRole,
): Promise<GroupWithRole> {
  const row = await loadGroupRow(db, groupId);
  const [members, recipeTotals] = await Promise.all([
    memberCounts(db, [groupId]),
    recipeCounts(db, [groupId]),
  ]);
  return toGroupWithRole(row, role, members.get(groupId) ?? 0, recipeTotals.get(groupId) ?? 0);
}

/** Members of a group incl. their public user record — ONE joined query. */
export async function listMembers(db: DbLike, groupId: string): Promise<GroupMember[]> {
  const rows = await db
    .select({ member: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.createdAt), asc(users.name));
  return rows.map((row) => toGroupMember(row.member, row.user));
}

/** The membership row of one user, mapped to the contract shape (404 if none). */
export async function getMember(
  db: DbLike,
  groupId: string,
  userId: string,
): Promise<GroupMember> {
  const [row] = await db
    .select({ member: groupMembers, user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!row) throw ApiError.notFound("server.group.memberNotFound");
  return toGroupMember(row.member, row.user);
}

/**
 * The raw membership row, for the role checks that need it before they can decide
 * what to do — {@link getMember} joins the user and builds the wire shape, which
 * those callers would only throw away.
 *
 * @throws ApiError 404 `member_not_found`.
 */
async function loadMemberRow(db: DbLike, groupId: string, userId: string) {
  const [row] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!row) throw ApiError.notFound("server.group.memberNotFound");
  return row;
}

/* -------------------------------------------------------------------------- */
/* writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Creates a group, makes the caller its owner and points
 * `users.active_group_id` at it — all inside one transaction.
 */
export async function createGroup(
  db: Database,
  userId: string,
  input: CreateGroupRequest,
): Promise<GroupWithRole> {
  const duplicate = await db
    .select({ id: groups.id })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(and(eq(groupMembers.userId, userId), eqFolded(groups.name, input.name)))
    .limit(1);
  if (duplicate.length > 0) {
    throw ApiError.conflict("group_name_taken", "server.group.nameTaken");
  }

  const id = crypto.randomUUID();
  const timestamp = nowMs();

  await withTransaction(db, async (tx) => {
    await tx.insert(groups).values({
      id,
      name: input.name,
      description: input.description ?? null,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.insert(groupMembers).values({
      id: crypto.randomUUID(),
      groupId: id,
      userId,
      role: "owner",
      createdAt: timestamp,
    });
    await tx
      .update(users)
      .set({ activeGroupId: id, updatedAt: timestamp })
      .where(eq(users.id, userId));
  });

  return toGroupWithRole(await loadGroupRow(db, id), "owner", 1, 0);
}

/** Renames/re-describes a group (admin+ enforced by the route middleware). */
export async function updateGroup(
  db: DbLike,
  groupId: string,
  role: GroupRole,
  input: UpdateGroupRequest,
): Promise<GroupWithRole> {
  await loadGroupRow(db, groupId);

  const patch: Partial<typeof groups.$inferInsert> = { updatedAt: nowMs() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  // Bare `/uploads/<file>`, never the signed wire value (lib/uploadUrls.ts).
  if (input.imageUrl !== undefined) patch.imageUrl = normalizeStoredUploadUrl(input.imageUrl) ?? null;

  await db.update(groups).set(patch).where(eq(groups.id, groupId));
  return getGroupWithRole(db, groupId, role);
}

/** Deletes a group; members, recipes, tags, collections and drafts cascade. */
export async function deleteGroup(db: DbLike, groupId: string): Promise<void> {
  await loadGroupRow(db, groupId);
  await db.delete(groups).where(eq(groups.id, groupId));
}

/**
 * Changes a member's role.
 * - only an owner may grant `owner`; the previous owner is demoted to `admin`
 *   in the same transaction (ownership transfer)
 * - only an owner may change the role of another owner
 * - the last owner can never lose the role -> 409 `last_owner`
 */
export async function updateMemberRole(
  db: Database,
  actor: Membership,
  targetUserId: string,
  nextRole: GroupRole,
): Promise<GroupMember> {
  const { groupId } = actor;
  const target = await loadMemberRow(db, groupId, targetUserId);

  const currentRole = toGroupRole(target.role);
  if (currentRole === nextRole) return getMember(db, groupId, targetUserId);

  if (nextRole === "owner" || currentRole === "owner") assertRole(actor, "owner");

  if (currentRole === "owner" && (await countOwners(db, groupId)) <= 1) {
    throw ApiError.conflict("last_owner", "server.group.lastOwner");
  }

  const timestamp = nowMs();
  await withTransaction(db, async (tx) => {
    if (nextRole === "owner") {
      // Exactly one owner per group: demote every current owner first.
      await tx
        .update(groupMembers)
        .set({ role: "admin" })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.role, "owner"),
            ne(groupMembers.userId, targetUserId),
          ),
        );
    }
    await tx
      .update(groupMembers)
      .set({ role: nextRole })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
    await tx.update(groups).set({ updatedAt: timestamp }).where(eq(groups.id, groupId));
  });

  return getMember(db, groupId, targetUserId);
}

/**
 * Removes a member (admin+) or lets a member leave the group themselves.
 * Admins may not remove someone above their own rank, and the last owner
 * cannot leave -> 409 `last_owner`.
 */
export async function removeMember(
  db: DbLike,
  actor: Membership,
  targetUserId: string,
): Promise<void> {
  const { groupId } = actor;
  const target = await loadMemberRow(db, groupId, targetUserId);

  const targetRole = toGroupRole(target.role);
  const isSelf = actor.userId === targetUserId;

  if (!isSelf) {
    assertRole(actor, "admin");
    if (targetRole === "owner") assertRole(actor, "owner");
  }

  if (targetRole === "owner" && (await countOwners(db, groupId)) <= 1) {
    throw ApiError.conflict(
      "last_owner",
      isSelf ? "server.group.transferOwnershipFirst" : "server.group.lastOwner",
    );
  }

  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
}
