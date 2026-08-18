/**
 * The read-only gate for accounts whose e-mail address was never confirmed.
 *
 * WHAT IS BEING PINNED (services/auth/verifiedEmail.ts has the reasoning):
 *   - every GET still works, so "read-only" is read-ONLY and not "locked out",
 *   - every write across recipes, imports, shopping and group creation answers
 *     403 `email_unverified`,
 *   - accepting an invite is the one write that stays open, or an invited
 *     flatmate could never get in,
 *   - confirming the address lifts all of it, in the same session,
 *   - and the gate is OFF when no mail transport is configured, which is the
 *     default self-hosted stack.
 *
 * The gate follows `isMailConfigured()` in production but is forced OFF under
 * `bun test` (a test file's mail stub must not silently re-authorise unrelated
 * files), so everything here goes through `setVerifiedEmailRequired()`. That is a
 * process-wide override: it MUST be handed back in `afterAll`, same rule as
 * `setMailer` / `setOcrImportEnabled`, or every later test file inherits it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { users } from "../src/db/schema.ts";
import { app } from "../src/index.ts";
import { SESSION_COOKIE } from "../src/lib/cookies.ts";
import { markEmailVerified } from "../src/services/auth/emailVerification.ts";
import {
  isVerifiedEmailRequired,
  setVerifiedEmailRequired,
} from "../src/services/auth/verifiedEmail.ts";
import { ConsoleMailer, setMailer } from "../src/services/mail/index.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const PASSWORD = "geheimes-passwort-123";

beforeAll(async () => {
  await runMigrations(db);
  // Silent: registration mails a confirmation link now, and this file makes a
  // lot of accounts.
  setMailer(new ConsoleMailer(() => undefined));
});

afterAll(() => {
  setVerifiedEmailRequired(null);
  setMailer(null);
});

beforeEach(() => {
  setVerifiedEmailRequired(true);
});

interface Account {
  userId: string;
  email: string;
  cookie: string;
  groupId: string;
}

function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}

async function request(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<Response> {
  return app.request(path, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body === undefined ? {} : JSON_HEADERS),
      ...(init.cookie === undefined ? {} : { Cookie: init.cookie }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** A brand-new, UNCONFIRMED account with its own group. */
async function register(name = "Neu"): Promise<Account> {
  const email = `gate-${crypto.randomUUID()}@example.com`;
  const response = await request("/api/auth/register", {
    method: "POST",
    body: { email, name, password: PASSWORD },
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as {
    user: { id: string };
    groups: Array<{ id: string }>;
  };
  const groupId = payload.groups[0]?.id;
  if (!groupId) throw new Error("registration produced no group");
  return { userId: payload.user.id, email, cookie: sessionCookie(response), groupId };
}

/** Confirms the address directly — the mail round-trip has its own test. */
async function confirm(account: Account): Promise<void> {
  await markEmailVerified(db, account.userId);
}

/**
 * The raw token out of a create-invite response. The endpoint returns only the
 * shareable `inviteUrl` — the token is never handed back on its own, so this is
 * the same string a recipient's browser would carry.
 */
function tokenFromInvite(body: unknown): string {
  const { inviteUrl } = body as { inviteUrl?: string };
  const token = inviteUrl?.split("/").at(-1);
  if (!token) throw new Error(`no token in invite response: ${JSON.stringify(body)}`);
  return token;
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code ?? "";
}

/* -------------------------------------------------------------------------- */
/* reading                                                                    */
/* -------------------------------------------------------------------------- */

describe("an unconfirmed account can still READ everything", () => {
  test("its session, its groups, and the group's recipes/lists all answer 200", async () => {
    const account = await register();

    for (const path of [
      "/api/auth/me",
      "/api/groups",
      `/api/groups/${account.groupId}`,
      `/api/groups/${account.groupId}/recipes`,
      `/api/groups/${account.groupId}/tags`,
      `/api/groups/${account.groupId}/collections`,
      `/api/groups/${account.groupId}/shopping-lists`,
      `/api/groups/${account.groupId}/imports`,
      // The wallet is the user's own, not the group's, and reading it has to keep
      // working — a card at a till is a read.
      "/api/cards",
    ]) {
      const response = await request(path, { cookie: account.cookie });
      expect({ path, status: response.status }).toEqual({ path, status: 200 });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* writing                                                                    */
/* -------------------------------------------------------------------------- */

describe("every write answers 403 email_unverified", () => {
  test("recipes, tags and collections", async () => {
    const account = await register();
    const base = `/api/groups/${account.groupId}`;

    const writes: Array<[string, string, unknown]> = [
      ["POST", `${base}/recipes`, { title: "Spam", ingredients: [], steps: [], tags: [] }],
      ["POST", `${base}/tags`, { name: "spam" }],
      ["POST", `${base}/collections`, { name: "Spam" }],
    ];

    for (const [method, path, body] of writes) {
      const response = await request(path, { method, body, cookie: account.cookie });
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
      expect(await errorCode(response)).toBe("email_unverified");
    }
  });

  test("every import source, including the ones that need no OCR", async () => {
    const account = await register();
    const base = `/api/groups/${account.groupId}/imports`;

    for (const [path, body] of [
      [`${base}/url`, { url: "https://www.chefkoch.de/rezepte/1/x.html" }],
      [`${base}/text`, { text: "250 g Mehl" }],
    ] as const) {
      const response = await request(path, { method: "POST", body, cookie: account.cookie });
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
      expect(await errorCode(response)).toBe("email_unverified");
    }
  });

  test("the import upload routes reject BEFORE reading the body", async () => {
    const account = await register();
    // No multipart body at all: a 403 here proves the middleware ran before the
    // handler tried to parse one (the same discipline the OCR capability guard
    // follows — never buffer 15 MB only to refuse it).
    const response = await app.request(
      `/api/groups/${account.groupId}/imports/image`,
      { method: "POST", headers: { Cookie: account.cookie } },
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("email_unverified");
  });

  test("shopping lists — the one feature that is otherwise writable offline", async () => {
    const account = await register();
    const response = await request(`/api/groups/${account.groupId}/shopping-lists`, {
      method: "POST",
      body: { name: "Einkauf" },
      cookie: account.cookie,
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("email_unverified");
  });

  test("saving a card — the only user-owned entity, gated like everything else", async () => {
    const account = await register();
    const save = await request("/api/cards", {
      method: "POST",
      body: { label: "Payback", format: "ean13", value: "401234567890" },
      cookie: account.cookie,
    });
    expect(save.status).toBe(403);
    expect(await errorCode(save)).toBe("email_unverified");

    // Including the "I showed this card" bump, which is why the web client fires
    // that request and forgets it instead of surfacing a failure (routes/cards.ts).
    const used = await request(`/api/cards/${crypto.randomUUID()}/used`, {
      method: "POST",
      cookie: account.cookie,
    });
    expect(used.status).toBe(403);
    expect(await errorCode(used)).toBe("email_unverified");
  });

  test("creating a group, renaming one, and inviting into one", async () => {
    const account = await register();

    const create = await request("/api/groups", {
      method: "POST",
      body: { name: "Zweite Gruppe" },
      cookie: account.cookie,
    });
    expect(create.status).toBe(403);
    expect(await errorCode(create)).toBe("email_unverified");

    const rename = await request(`/api/groups/${account.groupId}`, {
      method: "PATCH",
      body: { name: "Umbenannt" },
      cookie: account.cookie,
    });
    expect(rename.status).toBe(403);

    const invite = await request(`/api/groups/${account.groupId}/invites`, {
      method: "POST",
      body: { email: "jemand@example.com", role: "member" },
      cookie: account.cookie,
    });
    expect(invite.status).toBe(403);
    expect(await errorCode(invite)).toBe("email_unverified");
  });

  test("403, never 401 — a valid session must not be logged out over this", async () => {
    const account = await register();
    const response = await request(`/api/groups/${account.groupId}/tags`, {
      method: "POST",
      body: { name: "spam" },
      cookie: account.cookie,
    });
    expect(response.status).toBe(403);
    // Still signed in afterwards.
    expect((await request("/api/auth/me", { cookie: account.cookie })).status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* the escape hatches                                                         */
/* -------------------------------------------------------------------------- */

describe("what an unconfirmed account may still do", () => {
  test("accept an invite — the write that must never be gated", async () => {
    const host = await register("Gastgeber");
    await confirm(host);
    const invited = await register("Eingeladen");

    const created = await request(`/api/groups/${host.groupId}/invites`, {
      method: "POST",
      body: { email: invited.email, role: "member" },
      cookie: host.cookie,
    });
    expect(created.status).toBe(201);
    const token = tokenFromInvite(await created.json());

    const accepted = await request("/api/groups/invites/accept", {
      method: "POST",
      body: { token },
      cookie: invited.cookie,
    });
    expect(accepted.status).toBe(200);

    // ...and it can now READ the group it just joined, but still not write to it.
    expect(
      (await request(`/api/groups/${host.groupId}/recipes`, { cookie: invited.cookie })).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/groups/${host.groupId}/tags`, {
          method: "POST",
          body: { name: "spam" },
          cookie: invited.cookie,
        })
      ).status,
    ).toBe(403);
  });

  test("leave a group — being trapped in one is worse than what the gate prevents", async () => {
    const host = await register("Gastgeber");
    await confirm(host);
    const invited = await register("Eingeladen");

    const created = await request(`/api/groups/${host.groupId}/invites`, {
      method: "POST",
      body: { email: invited.email, role: "member" },
      cookie: host.cookie,
    });
    expect(created.status).toBe(201);
    const token = tokenFromInvite(await created.json());
    await request("/api/groups/invites/accept", {
      method: "POST",
      body: { token },
      cookie: invited.cookie,
    });

    const left = await request(`/api/groups/${host.groupId}/members/${invited.userId}`, {
      method: "DELETE",
      cookie: invited.cookie,
    });
    expect(left.status).toBe(204);
  });

  test("ask for a new confirmation mail, and change its own profile", async () => {
    const account = await register();

    expect(
      (await request("/api/auth/email/verify/request", { method: "POST", cookie: account.cookie }))
        .status,
    ).toBe(200);
    expect(
      (
        await request("/api/auth/me", {
          method: "PATCH",
          body: { name: "Anderer Name" },
          cookie: account.cookie,
        })
      ).status,
    ).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* lifting it                                                                 */
/* -------------------------------------------------------------------------- */

describe("confirming the address lifts the gate", () => {
  test("the same session can write immediately afterwards", async () => {
    const account = await register();

    const before = await request(`/api/groups/${account.groupId}/recipes`, {
      method: "POST",
      body: { title: "Vorher", ingredients: [], steps: [], tags: [] },
      cookie: account.cookie,
    });
    expect(before.status).toBe(403);

    await confirm(account);

    const after = await request(`/api/groups/${account.groupId}/recipes`, {
      method: "POST",
      body: { title: "Nachher", ingredients: [], steps: [], tags: [] },
      cookie: account.cookie,
    });
    // No re-login: the middleware reads the row through the session on every
    // request, so the confirmation click takes effect on the next one.
    expect(after.status).toBe(201);
  });

  test("the TIMESTAMP is what counts, not the boolean", async () => {
    const account = await register();
    // The takeover this codebase already fixed came from trusting the flag alone,
    // so a row with `email_verified = 1` and no evidence must stay locked out.
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, account.userId));

    const response = await request(`/api/groups/${account.groupId}/tags`, {
      method: "POST",
      body: { name: "spam" },
      cookie: account.cookie,
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("email_unverified");
  });
});

/* -------------------------------------------------------------------------- */
/* when it is switched off                                                    */
/* -------------------------------------------------------------------------- */

describe("a deployment with no mail transport is not gated at all", () => {
  test("an unconfirmed account writes freely", async () => {
    setVerifiedEmailRequired(false);
    const account = await register();

    const response = await request(`/api/groups/${account.groupId}/recipes`, {
      method: "POST",
      body: { title: "Ohne Mailserver", ingredients: [], steps: [], tags: [] },
      cookie: account.cookie,
    });
    expect(response.status).toBe(201);
  });

  test("`bun test` defaults to OFF, so a mail stub cannot re-authorise another file", () => {
    setVerifiedEmailRequired(null);
    expect(isVerifiedEmailRequired()).toBe(false);
  });

  test("/api/health advertises the state either way", async () => {
    setVerifiedEmailRequired(true);
    const on = (await (await request("/api/health")).json()) as {
      features: { verifiedEmailRequired: boolean };
    };
    expect(on.features.verifiedEmailRequired).toBe(true);

    setVerifiedEmailRequired(false);
    const off = (await (await request("/api/health")).json()) as {
      features: { verifiedEmailRequired: boolean };
    };
    expect(off.features.verifiedEmailRequired).toBe(false);
  });
});

/* Guards against this file leaking its override into the next one. */
test("the override is handed back", () => {
  setVerifiedEmailRequired(null);
  expect(SESSION_COOKIE.length).toBeGreaterThan(0);
});
