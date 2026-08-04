/**
 * OWNER: auth agent.
 *
 * Mounted at /api/auth (see src/index.ts). Handles email+password registration
 * and login, Bun.password (argon2id) hashing, opaque DB sessions with a 30-day
 * sliding cookie, and OAuth (Google + GitHub) via `arctic`.
 *
 * Endpoint contract: docs/API.md (section "Auth"). Request/response schemas come
 * from @toon/shared — do not invent new shapes here.
 * IMPORTANT: this file's agent also owns src/middleware/session.ts
 * (requireSession / optionalSession) and src/middleware/group.ts
 * (requireGroupRole); both are consumed by the other routers.
 */
import {
  type AuthSessionResponse,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  type MeResponse,
  type OAuthProvidersResponse,
  OAuthProviderSchema,
  RegisterRequestSchema,
  type SessionListResponse,
  UpdateProfileRequestSchema,
  type UserResponse,
} from "@toon/shared";
import { Hono } from "hono";
import type { z } from "zod";
import { db } from "../db/client.ts";
import {
  clearOAuthCookies,
  clearSessionCookie,
  readOAuthCookies,
  setOAuthCookies,
  setSessionCookie,
} from "../lib/cookies.ts";
import { ApiError } from "../lib/errors.ts";
import { created, json, noContent } from "../lib/http.ts";
import {
  type OAuthProvider,
  createAuthorization,
  exchangeCodeForProfile,
  isProviderConfigured,
  requireProviderConfigured,
  safeNextPath,
  webUrl,
} from "../lib/oauth.ts";
import { type AppContext, type AppEnv, requireUser } from "../lib/types.ts";
import { resolveMembership } from "../middleware/group.ts";
import { optionalSession, requireSession } from "../middleware/session.ts";
import { buildAuthSession } from "../services/auth/bootstrap.ts";
import { acceptInvite, loadRedeemableInvite } from "../services/auth/invites.ts";
import {
  linkOAuthAccount,
  listOAuthAccounts,
  loginWithOAuthProfile,
  unlinkOAuthAccount,
} from "../services/auth/oauthAccounts.ts";
import { hashPassword, verifyPassword } from "../services/auth/passwords.ts";
import {
  LOGIN_EMAIL_RULE,
  LOGIN_RULE,
  OAUTH_RULE,
  PASSWORD_RULE,
  REGISTER_RULE,
  clientIp,
  enforceRateLimit,
} from "../services/auth/rateLimit.ts";
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  findSessionByHandle,
  listSessionsForUser,
} from "../services/auth/sessions.ts";
import {
  DEFAULT_GROUP_NAME,
  createOwnedGroup,
  createUser,
  findUserByEmail,
  findUserById,
  setActiveGroup,
  updateUser,
} from "../services/auth/users.ts";

export const authRoutes = new Hono<AppEnv>();

/* ------------------------------- helpers --------------------------------- */

/** Parses + validates a JSON body. ZodError becomes 422 `validation_failed`. */
async function readJson<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw ApiError.badRequest("Der Anfrage-Body ist kein gültiges JSON");
  }
  return schema.parse(raw) as z.output<S>;
}

/** What we store on a session row for the "Angemeldete Geräte" screen. */
function fingerprint(c: AppContext): { ipAddress: string; userAgent: string | null } {
  return { ipAddress: clientIp(c), userAgent: c.req.header("user-agent") ?? null };
}

/** Creates the session row and sets the cookie. */
async function startSession(c: AppContext, userId: string): Promise<void> {
  const session = await createSession(db, userId, fingerprint(c));
  setSessionCookie(c, session.id, session.expiresAt);
}

/** Loads the row behind c.var.user and builds the bootstrap payload. */
async function authPayload(userId: string): Promise<AuthSessionResponse> {
  const row = await findUserById(db, userId);
  if (!row) throw ApiError.unauthorized();
  return buildAuthSession(db, row);
}

/** Path param -> provider, 404 for anything else. */
function readProvider(c: AppContext): OAuthProvider {
  const parsed = OAuthProviderSchema.safeParse(c.req.param("provider"));
  if (!parsed.success) throw ApiError.notFound("Unbekannter OAuth-Anbieter");
  return parsed.data;
}

/* ----------------------------- registration ------------------------------ */

authRoutes.post("/register", async (c) => {
  const body = await readJson(c, RegisterRequestSchema);
  enforceRateLimit(c, "register", clientIp(c), REGISTER_RULE);

  // Validate the invite BEFORE creating anything, so a bad token cannot leave a
  // user without a group behind.
  if (body.inviteToken) await loadRedeemableInvite(db, body.inviteToken);

  if (await findUserByEmail(db, body.email)) {
    throw ApiError.conflict("email_taken", "Diese E-Mail-Adresse ist bereits registriert");
  }

  const passwordHash = await hashPassword(body.password);
  const user = await createUser(db, {
    email: body.email,
    name: body.name,
    passwordHash,
    // FALSE ON PURPOSE. There is no confirmation-mail flow, so self-registration
    // proves nothing about who owns the address. Claiming `true` here used to let
    // an attacker pre-register a victim's address and have the victim's later
    // Google/GitHub login auto-linked into the attacker's account — see the
    // header of services/auth/oauthAccounts.ts.
    emailVerified: false,
  });

  if (body.inviteToken) {
    const accepted = await acceptInvite(db, body.inviteToken, user.id);
    await setActiveGroup(db, user.id, accepted.groupId);
  } else {
    await createOwnedGroup(db, user.id, body.groupName ?? DEFAULT_GROUP_NAME);
  }

  await startSession(c, user.id);
  return created(c, await authPayload(user.id));
});

/* -------------------------------- login ---------------------------------- */

authRoutes.post("/login", async (c) => {
  const body = await readJson(c, LoginRequestSchema);
  enforceRateLimit(c, "login", `${clientIp(c)}|${body.email}`, LOGIN_RULE);
  // Second ceiling that no forwarding header can reset — see LOGIN_EMAIL_RULE.
  enforceRateLimit(c, "login-email", body.email, LOGIN_EMAIL_RULE);

  const user = await findUserByEmail(db, body.email);
  // Always runs an argon2id verification (dummy hash for unknown accounts), so
  // the response time does not reveal whether the e-mail exists.
  const matches = await verifyPassword(body.password, user?.passwordHash ?? null);

  if (!user) throw ApiError.invalidCredentials();
  if (!user.passwordHash) {
    throw new ApiError(
      401,
      "invalid_credentials",
      "Für dieses Konto ist kein Passwort gesetzt. Bitte melde dich mit Google oder GitHub an.",
    );
  }
  if (!matches) throw ApiError.invalidCredentials();

  await startSession(c, user.id);
  const payload: AuthSessionResponse = await authPayload(user.id);
  return json(c, payload);
});

/* -------------------------------- logout --------------------------------- */

authRoutes.post("/logout", requireSession(), async (c) => {
  const sessionId = c.get("sessionId");
  if (sessionId) await deleteSession(db, sessionId);
  clearSessionCookie(c);
  return noContent(c);
});

/* --------------------------------- me ------------------------------------ */

authRoutes.get("/me", requireSession(), async (c) => {
  const user = requireUser(c);
  const payload: MeResponse = await authPayload(user.id);
  return json(c, payload);
});

authRoutes.patch("/me", requireSession(), async (c) => {
  const user = requireUser(c);
  const body = await readJson(c, UpdateProfileRequestSchema);

  if (typeof body.activeGroupId === "string") {
    const access = await resolveMembership(body.activeGroupId, user.id);
    if (!access.membership) {
      throw ApiError.validationFailed(
        [
          {
            path: "activeGroupId",
            code: "custom",
            message: "Keine Mitgliedschaft in dieser Gruppe",
          },
        ],
        "Du bist kein Mitglied dieser Gruppe",
      );
    }
  }

  const patch: Parameters<typeof updateUser>[2] = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl ?? null;
  if (body.activeGroupId !== undefined) patch.activeGroupId = body.activeGroupId ?? null;

  const row = await updateUser(db, user.id, patch);
  const session = await buildAuthSession(db, row);
  const payload: UserResponse = { user: session.user };
  return json(c, payload);
});

/* ------------------------------ password --------------------------------- */

authRoutes.post("/password", requireSession(), async (c) => {
  const user = requireUser(c);
  const body = await readJson(c, ChangePasswordRequestSchema);
  enforceRateLimit(c, "password", user.id, PASSWORD_RULE);

  const row = await findUserById(db, user.id);
  if (!row) throw ApiError.unauthorized();

  if (row.passwordHash) {
    if (!body.currentPassword) {
      throw ApiError.invalidCredentials("Bitte gib dein aktuelles Passwort ein");
    }
    const matches = await verifyPassword(body.currentPassword, row.passwordHash);
    if (!matches) throw ApiError.invalidCredentials("Das aktuelle Passwort ist falsch");
  }

  const passwordHash = await hashPassword(body.newPassword);
  await updateUser(db, user.id, { passwordHash });
  // A password change signs every other device out.
  await deleteOtherSessions(db, user.id, c.get("sessionId"));
  return noContent(c);
});

/* ------------------------------- sessions -------------------------------- */

authRoutes.get("/sessions", requireSession(), async (c) => {
  const user = requireUser(c);
  const items = await listSessionsForUser(db, user.id, c.get("sessionId"));
  const payload: SessionListResponse = { items };
  return json(c, payload);
});

authRoutes.delete("/sessions/:sessionId", requireSession(), async (c) => {
  const user = requireUser(c);
  const target = await findSessionByHandle(db, user.id, c.req.param("sessionId"));
  if (!target) throw ApiError.notFound("Sitzung nicht gefunden");

  await deleteSession(db, target.id);
  if (target.id === c.get("sessionId")) clearSessionCookie(c);
  return noContent(c);
});

/* --------------------------------- OAuth --------------------------------- */

/**
 * GET /api/auth/oauth — which providers this deployment can actually use, plus
 * (with a session) which of them the current user has linked. The login screen
 * hides unconfigured buttons with it, the profile screen renders the link list.
 * Additive to the contract. MUST stay registered before "/oauth/:provider".
 */
authRoutes.get("/oauth", optionalSession(), async (c) => {
  const user = c.get("user");
  const links = user ? await listOAuthAccounts(db, user.id) : [];
  const payload: OAuthProvidersResponse = {
    providers: OAuthProviderSchema.options.map((provider) => {
      const link = links.find((row) => row.provider === provider);
      return {
        provider,
        configured: isProviderConfigured(provider),
        linked: link !== undefined,
        linkedEmail: link?.providerEmail ?? null,
      };
    }),
  };
  return json(c, payload);
});

/**
 * GET /api/auth/oauth/:provider/link — starts the SAME arctic handshake as a
 * login, but for an authenticated user, and marks the flow as "link" so the
 * callback attaches the identity instead of logging somebody in. This is the only
 * way password and OAuth end up on one account (there is no auto-link on e-mail
 * match — see services/auth/oauthAccounts.ts). Additive to the contract.
 */
authRoutes.get("/oauth/:provider/link", requireSession(), async (c) => {
  const provider = readProvider(c);
  requireProviderConfigured(provider);

  const start = createAuthorization(provider);
  const next = safeNextPath(c.req.query("next")) ?? "/settings";
  setOAuthCookies(c, {
    state: start.state,
    codeVerifier: start.codeVerifier,
    next,
    intent: "link",
  });

  if (c.req.query("json") === "1") return json(c, { url: start.url });
  return c.redirect(start.url, 302);
});

/** DELETE /api/auth/oauth/:provider — detach a provider. Additive. */
authRoutes.delete("/oauth/:provider", requireSession(), async (c) => {
  const provider = readProvider(c);
  const user = requireUser(c);
  const row = await findUserById(db, user.id);
  if (!row) throw ApiError.unauthorized();
  await unlinkOAuthAccount(db, row, provider);
  return noContent(c);
});

authRoutes.get("/oauth/:provider", async (c) => {
  const provider = readProvider(c);

  // A browser navigation must never dead-end on raw JSON: the Google/GitHub
  // buttons are visible on a default install where OAuth is not configured, so
  // send the user back to the login screen, which already renders
  // ?error=oauth_not_configured as a German message. Only the ?json=1 form
  // (used by scripts/tests) still gets the 400.
  if (!isProviderConfigured(provider)) {
    if (c.req.query("json") === "1") requireProviderConfigured(provider);
    return c.redirect(webUrl("/login", { error: "oauth_not_configured" }), 302);
  }

  const start = createAuthorization(provider);
  const next = safeNextPath(c.req.query("next"));
  setOAuthCookies(c, { state: start.state, codeVerifier: start.codeVerifier, next });

  if (c.req.query("json") === "1") return json(c, { url: start.url });
  return c.redirect(start.url, 302);
});

authRoutes.get("/oauth/:provider/callback", optionalSession(), async (c) => {
  const provider = readProvider(c);
  // "Not configured" is a server-side problem, not a failed login: answer JSON
  // (400 oauth_not_configured) instead of bouncing the user to the web app.
  requireProviderConfigured(provider);
  enforceRateLimit(c, "oauth", clientIp(c), OAUTH_RULE);

  const cookies = readOAuthCookies(c);
  clearOAuthCookies(c);
  const next = safeNextPath(cookies.next) ?? "/";
  const linking = cookies.intent === "link";

  try {
    const providerError = c.req.query("error");
    if (providerError) {
      throw new ApiError(400, "oauth_failed", `Der Anbieter hat abgebrochen: ${providerError}`);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      throw new ApiError(400, "oauth_failed", "Unvollständige Antwort des Anbieters");
    }
    if (!cookies.state || state !== cookies.state) {
      throw new ApiError(400, "oauth_failed", "OAuth-Sitzung abgelaufen, bitte erneut anmelden");
    }

    const profile = await exchangeCodeForProfile(provider, code, cookies.codeVerifier);

    if (linking) {
      // The session cookie survives the provider round-trip (SameSite=Lax on a
      // top-level GET); without it we cannot know whose account to extend.
      const sessionUser = c.get("user");
      if (!sessionUser) throw ApiError.unauthorized("Bitte erneut anmelden und nochmal versuchen.");
      await linkOAuthAccount(db, sessionUser.id, profile);
      return c.redirect(webUrl(next, { linked: provider }), 302);
    }

    const { user } = await loginWithOAuthProfile(db, profile);
    await startSession(c, user.id);
    return c.redirect(webUrl(next), 302);
  } catch (error) {
    const errorCode = error instanceof ApiError ? String(error.code) : "oauth_failed";
    if (!(error instanceof ApiError)) console.error("[auth] OAuth callback failed:", error);
    if (linking) return c.redirect(webUrl(next, { error: errorCode }), 302);
    return c.redirect(webUrl("/login", { error: errorCode }), 302);
  }
});

export default authRoutes;
