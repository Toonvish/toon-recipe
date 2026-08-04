/**
 * OWNER: auth agent.
 *
 * User records: lookup, creation (incl. the first group every account needs)
 * and the row -> `User` DTO mapping used by every auth response.
 */
import type { User } from "@toon/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type UserRow, groupMembers, groups, users } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import { toIso, toIsoOrNull } from "../../lib/http.ts";
import { signUploadUrl } from "../../lib/uploadUrls.ts";

/** Default name of the group created for a brand-new account. */
export const DEFAULT_GROUP_NAME = "Meine Rezepte";

/** Row -> the shape every auth endpoint returns. `hasPassword` hides the hash. */
export function toUserDto(row: UserRow, activeGroupId?: string | null): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: signUploadUrl(row.avatarUrl),
    emailVerified: row.emailVerified,
    emailVerifiedAt: toIsoOrNull(row.emailVerifiedAt),
    hasPassword: typeof row.passwordHash === "string" && row.passwordHash.length > 0,
    activeGroupId: activeGroupId === undefined ? row.activeGroupId : activeGroupId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Case-insensitive lookup (e-mails are stored normalized to lowercase). */
export async function findUserByEmail(
  database: Database,
  email: string,
): Promise<UserRow | undefined> {
  const rows = await database
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0];
}

export async function findUserById(database: Database, id: string): Promise<UserRow | undefined> {
  const rows = await database.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export interface CreateUserInput {
  email: string;
  name: string;
  /** argon2id hash, or null for OAuth-only accounts. */
  passwordHash?: string | null;
  avatarUrl?: string | null;
  /**
   * ONLY set this when something actually proved the address belongs to the
   * user — today that means an OAuth provider that reports it as verified.
   * Self-registration must leave it `false` (the default): there is no
   * confirmation-mail flow, and a trusted-looking flag was previously enough to
   * hand a victim's OAuth login to whoever registered their address first.
   */
  emailVerified?: boolean;
}

/** Inserts a user, mapping the unique-email constraint to 409 `email_taken`. */
export async function createUser(database: Database, input: CreateUserInput): Promise<UserRow> {
  const now = Date.now();
  const emailVerified = input.emailVerified ?? false;
  const row: UserRow = {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    avatarUrl: input.avatarUrl ?? null,
    emailVerified,
    // The flag and its evidence are always written together — see the column
    // comment in db/schema.ts and markEmailVerified() in emailVerification.ts.
    emailVerifiedAt: emailVerified ? now : null,
    passwordHash: input.passwordHash ?? null,
    activeGroupId: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await database.insert(users).values(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict("email_taken", "Diese E-Mail-Adresse ist bereits registriert");
    }
    throw error;
  }
  return row;
}

/** Creates a group with `userId` as its owner and makes it the active group. */
export async function createOwnedGroup(
  database: Database,
  userId: string,
  name: string,
  description?: string | null,
): Promise<{ groupId: string }> {
  const now = Date.now();
  const groupId = crypto.randomUUID();
  await database.insert(groups).values({
    id: groupId,
    name: name.trim().length > 0 ? name.trim() : DEFAULT_GROUP_NAME,
    description: description ?? null,
    imageUrl: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  await database.insert(groupMembers).values({
    id: crypto.randomUUID(),
    groupId,
    userId,
    role: "owner",
    createdAt: now,
  });
  await setActiveGroup(database, userId, groupId);
  return { groupId };
}

/** Writes `users.active_group_id` (a soft UI pointer, no FK). */
export async function setActiveGroup(
  database: Database,
  userId: string,
  groupId: string | null,
): Promise<void> {
  await database
    .update(users)
    .set({ activeGroupId: groupId, updatedAt: Date.now() })
    .where(eq(users.id, userId));
}

/** Applies a profile patch and returns the updated row. */
export async function updateUser(
  database: Database,
  userId: string,
  /**
   * `emailVerified` is deliberately NOT patchable here: the flag and
   * `emailVerifiedAt` must move together, so markEmailVerified()
   * (services/auth/emailVerification.ts) is the only writer.
   */
  patch: Partial<Pick<UserRow, "name" | "avatarUrl" | "activeGroupId" | "passwordHash">>,
): Promise<UserRow> {
  await database
    .update(users)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(users.id, userId));
  const row = await findUserById(database, userId);
  if (!row) throw ApiError.notFound("Benutzer nicht gefunden");
  return row;
}

/** True for a SQLite UNIQUE constraint failure, whatever the driver wraps it in. */
export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String((error as { code?: unknown }).code ?? "")}` : String(error);
  return /unique constraint|sqlite_constraint_unique|constraint failed: users\.email/i.test(message);
}

/** Fallback display name for OAuth profiles without a name ("max" from "max@x.de"). */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (cleaned.length === 0) return "Nutzer";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 80);
}
