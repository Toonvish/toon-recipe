/**
 * OWNER: auth agent.
 *
 * Builds the `AuthSessionResponse` / `MeResponse` payload: the user, every group
 * they belong to (with role + counts) and the effective active group.
 *
 * NOTE: `GET /api/groups` (groups agent) returns the same `GroupWithRole` shape;
 * the query is duplicated on purpose so the two routers stay independent.
 */
import type { AuthSessionResponse, GroupRole, GroupWithRole } from "@toon/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type UserRow, groupMembers, groups } from "../../db/schema.ts";
import { toIso } from "../../lib/http.ts";
import { setActiveGroup, toUserDto } from "./users.ts";

/** Every group of a user, alphabetically, with member and recipe counts. */
export async function loadUserGroups(
  database: Database,
  userId: string,
): Promise<GroupWithRole[]> {
  const rows = await database
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      imageUrl: groups.imageUrl,
      createdBy: groups.createdBy,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      role: groupMembers.role,
      memberCount: sql<number>`(select count(*) from group_members gm where gm.group_id = ${groups.id})`,
      recipeCount: sql<number>`(select count(*) from recipes r where r.group_id = ${groups.id})`,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groups.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    role: row.role as GroupRole,
    memberCount: Number(row.memberCount ?? 0),
    recipeCount: Number(row.recipeCount ?? 0),
  }));
}

/**
 * The one bootstrap payload used by register, login and GET /api/auth/me.
 * A stale `users.active_group_id` (group deleted, membership removed) is healed
 * here: it falls back to the first group and is persisted.
 */
export async function buildAuthSession(
  database: Database,
  user: UserRow,
): Promise<AuthSessionResponse> {
  const userGroups = await loadUserGroups(database, user.id);
  const stored = user.activeGroupId ?? null;
  const isValid = stored !== null && userGroups.some((group) => group.id === stored);
  const effective = isValid ? stored : (userGroups[0]?.id ?? null);

  if (effective !== stored) {
    await setActiveGroup(database, user.id, effective);
  }

  return {
    user: toUserDto(user, effective),
    groups: userGroups,
    activeGroupId: effective,
  };
}
