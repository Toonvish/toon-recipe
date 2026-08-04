/**
 * Group membership lookups and role assertions.
 *
 * The request-level check lives in the auth agent's `requireGroupRole`
 * middleware; the helpers here cover the finer-grained rules the services need
 * on top of it (ownership transfer, last-owner protection, author-or-admin).
 */
import type { GroupRole } from "@toon/shared";
import { roleAtLeast } from "@toon/shared";
import { and, eq } from "drizzle-orm";
import { groupMembers } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import type { Membership } from "../../lib/types.ts";
import type { DbLike } from "./support.ts";

/** Parses a role column value; unknown values degrade to the weakest role. */
export function toGroupRole(value: string): GroupRole {
  return value === "owner" || value === "admin" ? value : "member";
}

/** Throws 403 unless `membership.role` satisfies `required`. */
export function assertRole(membership: Membership, required: GroupRole): void {
  if (!roleAtLeast(membership.role, required)) {
    throw ApiError.forbidden(
      required === "owner"
        ? "Nur die Besitzerin oder der Besitzer der Gruppe darf das"
        : "Dafür brauchst du Administratorrechte in dieser Gruppe",
    );
  }
}

/** Number of owners in a group — the guard behind the `last_owner` conflict. */
export async function countOwners(db: DbLike, groupId: string): Promise<number> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, "owner")));
  return rows.length;
}
