/**
 * Group authorisation middleware — the ONLY place that decides whether the
 * session user may touch a group's data. Routers apply it once:
 *
 *   recipeRoutes.use("*", requireSession(), requireGroupRole("member"));
 *   groupRoutes.delete("/:groupId", requireGroupRole("owner"), handler);
 *
 * Semantics (docs/API.md):
 *   no session            -> 401 unauthorized
 *   unknown group/resource -> 404 not_found   (never leaks that it exists)
 *   not a member           -> 403 forbidden
 *   role too low           -> 403 forbidden
 *   ok                     -> c.set("membership", { groupId, userId, role })
 *
 * The group id normally comes from the `:groupId` path param. For routes that
 * address a resource directly (`/recipes/:recipeId`, `/collections/:collectionId`,
 * `/tags/:tagId`, `/imports/:draftId`, `/invites/:inviteId`) the group is resolved
 * through that resource instead.
 */
import type { GroupRole } from "@toon/shared";
import { roleAtLeast } from "@toon/shared";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db } from "../db/client.ts";
import {
  collections,
  groupInvites,
  groupMembers,
  groups,
  importDrafts,
  recipes,
  tags,
} from "../db/schema.ts";
import { ApiError } from "../lib/errors.ts";
import type { AppContext, AppEnv, Membership } from "../lib/types.ts";
import { requireUser } from "../lib/types.ts";

/** Route params that identify a group-scoped resource, in resolution order. */
const RESOURCE_PARAMS = [
  "recipeId",
  "collectionId",
  "tagId",
  "draftId",
  "inviteId",
] as const;

export type ResourceParam = (typeof RESOURCE_PARAMS)[number];

export interface GroupRoleOptions {
  /**
   * Force resolution through a specific resource param instead of auto-detecting
   * it (useful when a route carries several ids).
   */
  via?: ResourceParam;
}

/** Unknown role strings in the DB degrade to the weakest role. */
function toRole(value: string): GroupRole {
  return value === "owner" || value === "admin" ? value : "member";
}

/** Looks up the owning group of a resource id, or null when it does not exist. */
async function groupIdOfResource(param: ResourceParam, id: string): Promise<string | null> {
  switch (param) {
    case "recipeId": {
      const rows = await db.select({ groupId: recipes.groupId }).from(recipes).where(eq(recipes.id, id)).limit(1);
      return rows[0]?.groupId ?? null;
    }
    case "collectionId": {
      const rows = await db
        .select({ groupId: collections.groupId })
        .from(collections)
        .where(eq(collections.id, id))
        .limit(1);
      return rows[0]?.groupId ?? null;
    }
    case "tagId": {
      const rows = await db.select({ groupId: tags.groupId }).from(tags).where(eq(tags.id, id)).limit(1);
      return rows[0]?.groupId ?? null;
    }
    case "draftId": {
      const rows = await db
        .select({ groupId: importDrafts.groupId })
        .from(importDrafts)
        .where(eq(importDrafts.id, id))
        .limit(1);
      return rows[0]?.groupId ?? null;
    }
    case "inviteId": {
      const rows = await db
        .select({ groupId: groupInvites.groupId })
        .from(groupInvites)
        .where(eq(groupInvites.id, id))
        .limit(1);
      return rows[0]?.groupId ?? null;
    }
  }
}

/**
 * Determines which group the request targets. Throws 404 when the addressed
 * resource does not exist and 400 when the route carries no usable id at all.
 */
export async function resolveGroupId(c: AppContext, options: GroupRoleOptions = {}): Promise<string> {
  if (!options.via) {
    const direct = c.req.param("groupId");
    if (direct && direct.length > 0) return direct;
  }

  const candidates: readonly ResourceParam[] = options.via ? [options.via] : RESOURCE_PARAMS;
  for (const param of candidates) {
    const id = c.req.param(param);
    if (!id || id.length === 0) continue;
    const groupId = await groupIdOfResource(param, id);
    if (!groupId) throw ApiError.notFound("Nicht gefunden");
    return groupId;
  }

  throw ApiError.badRequest("Gruppen-ID fehlt in der Anfrage");
}

/**
 * Membership + role of `userId` in `groupId`, distinguishing "group unknown"
 * from "not a member" in a single query.
 */
export async function resolveMembership(
  groupId: string,
  userId: string,
): Promise<{ exists: boolean; membership?: Membership }> {
  const rows = await db
    .select({ id: groups.id, role: groupMembers.role })
    .from(groups)
    .leftJoin(groupMembers, and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)))
    .where(eq(groups.id, groupId))
    .limit(1);

  const row = rows[0];
  if (!row) return { exists: false };
  if (row.role === null) return { exists: true };
  return { exists: true, membership: { groupId, userId, role: toRole(row.role) } };
}

/**
 * Factory: middleware that requires at least `required` in the addressed group.
 * Defaults to "member" so `requireGroupRole()` is valid too.
 */
export function requireGroupRole(
  required: GroupRole = "member",
  options: GroupRoleOptions = {},
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = requireUser(c);
    const groupId = await resolveGroupId(c, options);
    const access = await resolveMembership(groupId, user.id);

    if (!access.exists) throw ApiError.notFound("Gruppe nicht gefunden");
    if (!access.membership) throw ApiError.forbidden("Kein Zugriff auf diese Gruppe");

    if (!roleAtLeast(access.membership.role, required)) {
      throw ApiError.forbidden(
        required === "owner"
          ? "Nur die Besitzerin oder der Besitzer der Gruppe darf das"
          : "Dafür brauchst du Administratorrechte in dieser Gruppe",
      );
    }

    c.set("membership", access.membership);
    await next();
  };
}

/** Convenience aliases so call sites read like the docs' auth levels. */
export const requireGroupMember = (): MiddlewareHandler<AppEnv> => requireGroupRole("member");
export const requireGroupAdmin = (): MiddlewareHandler<AppEnv> => requireGroupRole("admin");
export const requireGroupOwner = (): MiddlewareHandler<AppEnv> => requireGroupRole("owner");
