/**
 * OWNER: auth agent.
 *
 * The login / create decision behind the OAuth callback:
 *
 *  1. `oauth_accounts(provider, provider_user_id)` already known  -> log that user in
 *  2. the address is free -> create a user (password_hash NULL) plus the first
 *     group, exactly like registration does
 *  3. the address belongs to an existing local account -> 409 `email_taken`
 *
 * WHY THERE IS NO AUTOMATIC LINK-ON-EMAIL-MATCH (this used to be case 2):
 * `POST /api/auth/register` cannot prove that the registrant owns the address —
 * there is no confirmation-mail flow — so `users.email_verified` was `true` for
 * every self-registered row. Auto-linking on that flag meant: attacker registers
 * victim@gmail.com with a password of their choosing, the victim later signs in
 * with Google, and the provider identity gets LINKED INTO THE ATTACKER'S account
 * — full takeover of the victim's groups and recipes while the victim sees a
 * perfectly normal login. Registration now stores `email_verified: false`, and
 * linking is an EXPLICIT, authenticated action ({@link linkOAuthAccount} behind
 * `GET /api/auth/oauth/:provider/link`). Once a confirmation-mail flow exists,
 * an auto-link may come back — gated on a real verification timestamp, not on a
 * flag the registrant set themselves.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { type UserRow, oauthAccounts } from "../../db/schema.ts";
import { ApiError } from "../../lib/errors.ts";
import type { OAuthProfile } from "../../lib/oauth.ts";
import {
  DEFAULT_GROUP_NAME,
  createOwnedGroup,
  createUser,
  displayNameFromEmail,
  findUserByEmail,
  findUserById,
  updateUser,
} from "./users.ts";

export type OAuthOutcome = "login" | "linked" | "created";

export interface OAuthLoginResult {
  user: UserRow;
  outcome: OAuthOutcome;
}

/** Resolves (or creates) the local account for an OAuth profile. */
export async function loginWithOAuthProfile(
  database: Database,
  profile: OAuthProfile,
): Promise<OAuthLoginResult> {
  const existingLink = await database
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId),
      ),
    )
    .limit(1);

  const link = existingLink[0];
  if (link) {
    const user = await findUserById(database, link.userId);
    if (!user) {
      // Orphaned link (user row gone): drop it and fall through to creation.
      await database.delete(oauthAccounts).where(eq(oauthAccounts.id, link.id));
    } else {
      if ((profile.email ?? null) !== (link.providerEmail ?? null)) {
        await database
          .update(oauthAccounts)
          .set({ providerEmail: profile.email })
          .where(eq(oauthAccounts.id, link.id));
      }
      const patched = await refreshProfileFields(database, user, profile);
      return { user: patched, outcome: "login" };
    }
  }

  const email = profile.email;
  if (email) {
    // NEVER silently adopt an address that already has a local account, however
    // well the provider vouched for it — see the file header.
    const existingUser = await findUserByEmail(database, email);
    if (existingUser) {
      throw ApiError.conflict(
        "email_taken",
        "Diese E-Mail-Adresse ist bereits registriert. Melde dich mit Passwort an und verknüpfe den Anbieter danach im Profil.",
      );
    }
  }

  const created = await createUser(database, {
    // Providers that hide the address (GitHub without user:email) still get a
    // usable, unique local identity.
    email: email ?? `${profile.provider}-${profile.providerUserId}@oauth.local`,
    name: profile.name ?? (email ? displayNameFromEmail(email) : "Nutzer"),
    avatarUrl: profile.avatarUrl,
    passwordHash: null,
    emailVerified: profile.emailVerified,
  });
  await insertLink(database, created.id, profile);
  await createOwnedGroup(database, created.id, DEFAULT_GROUP_NAME);
  const withGroup = (await findUserById(database, created.id)) ?? created;
  return { user: withGroup, outcome: "created" };
}

async function insertLink(
  database: Database,
  userId: string,
  profile: OAuthProfile,
): Promise<void> {
  await database.insert(oauthAccounts).values({
    id: crypto.randomUUID(),
    userId,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    providerEmail: profile.email,
    createdAt: Date.now(),
  });
}

/** Fills in a missing avatar/name from the provider, but never overwrites one. */
async function refreshProfileFields(
  database: Database,
  user: UserRow,
  profile: OAuthProfile,
): Promise<UserRow> {
  const patch: Partial<Pick<UserRow, "avatarUrl" | "name">> = {};
  if (!user.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
  if (user.name.trim().length === 0 && profile.name) patch.name = profile.name;
  if (Object.keys(patch).length === 0) return user;
  return updateUser(database, user.id, patch);
}

/** OAuth identities of a user (used by the profile screen). */
export async function listOAuthAccounts(database: Database, userId: string) {
  return database.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
}

/**
 * Attaches a provider identity to an ALREADY AUTHENTICATED user — the only way a
 * password account and an OAuth identity ever end up on the same row.
 *
 * Idempotent when the identity is already linked to this very user.
 *
 * @throws ApiError 409 `oauth_already_linked` when the identity belongs to
 *   someone else, or when this user already linked a different identity of the
 *   same provider.
 */
export async function linkOAuthAccount(
  database: Database,
  userId: string,
  profile: OAuthProfile,
): Promise<void> {
  const existing = await database
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId),
      ),
    )
    .limit(1);

  const link = existing[0];
  if (link) {
    if (link.userId === userId) return;
    throw ApiError.conflict(
      "oauth_already_linked",
      "Dieses Anbieter-Konto ist bereits mit einem anderen Nutzer verknüpft.",
    );
  }

  const mine = await database
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, profile.provider)))
    .limit(1);
  if (mine[0]) {
    throw ApiError.conflict(
      "oauth_already_linked",
      "Für diesen Anbieter ist schon ein Konto verknüpft. Trenne es zuerst.",
    );
  }

  await insertLink(database, userId, profile);
}

/**
 * Detaches a provider identity.
 *
 * @throws ApiError 404 when nothing is linked, 409 `last_login_method` when
 *   removing it would lock the user out (no password and no other provider).
 */
export async function unlinkOAuthAccount(
  database: Database,
  user: UserRow,
  provider: OAuthProfile["provider"],
): Promise<void> {
  const links = await listOAuthAccounts(database, user.id);
  const target = links.find((row) => row.provider === provider);
  if (!target) throw ApiError.notFound("Für diesen Anbieter ist nichts verknüpft.");

  const remaining = links.length - 1;
  if (remaining === 0 && !user.passwordHash) {
    throw ApiError.conflict(
      "last_login_method",
      "Das ist deine einzige Anmeldemöglichkeit. Lege zuerst ein Passwort fest.",
    );
  }

  await database.delete(oauthAccounts).where(eq(oauthAccounts.id, target.id));
}
