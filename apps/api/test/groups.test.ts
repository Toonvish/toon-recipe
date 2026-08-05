/**
 * Integration tests for /api/groups: groups, members, roles, invites.
 *
 * They run against the process-wide in-memory libSQL database (env forces
 * DATABASE_URL=file::memory: under NODE_ENV=test) and go through the real Hono
 * app, i.e. through the auth agent's session + group middleware. Sessions are
 * created by inserting a `sessions` row and sending the documented
 * `toon_session` cookie — no dependency on the auth routes.
 */
import { foldText } from "@toon/shared";
import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { groupInvites, groupMembers, groups, recipes, sessions, users } from "../src/db/schema.ts";
import { type Mailer, setMailer } from "../src/services/mail/index.ts";

await runMigrations(db);

interface TestUser {
  id: string;
  email: string;
  name: string;
  cookie: string;
}

/** Creates a verified user plus a valid session cookie. */
async function createUser(name: string): Promise<TestUser> {
  const id = crypto.randomUUID();
  const email = `${name.toLowerCase()}.${id.slice(0, 8)}@toon.test`;
  await db.insert(users).values({ id, email, name, emailVerified: true });
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  await db
    .insert(sessions)
    .values({ id: sessionId, userId: id, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });
  return { id, email, name, cookie: `toon_session=${sessionId}` };
}

interface RequestOptions {
  method?: string;
  cookie?: string;
  body?: unknown;
}

/** app.request wrapper: JSON in, Response out. */
async function call(path: string, options: RequestOptions = {}): Promise<Response> {
  const { app } = await import("../src/index.ts");
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

interface GroupPayload {
  group: { id: string; name: string; role: string; memberCount: number; recipeCount: number };
}
interface ErrorPayload {
  error: { code: string; message: string };
}

/** Creates a group owned by `user` and returns its id. */
async function createGroup(user: TestUser, name: string): Promise<string> {
  const response = await call("/api/groups", { method: "POST", cookie: user.cookie, body: { name } });
  expect(response.status).toBe(201);
  const payload = await body<GroupPayload>(response);
  return payload.group.id;
}

describe("POST /api/groups", () => {
  test("creates the group, makes the caller owner and activates it", async () => {
    const owner = await createUser("Owner");
    const response = await call("/api/groups", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "Familie Müller", description: "Unsere Rezepte" },
    });

    expect(response.status).toBe(201);
    const { group } = await body<GroupPayload>(response);
    expect(group.name).toBe("Familie Müller");
    expect(group.role).toBe("owner");
    expect(group.memberCount).toBe(1);
    expect(group.recipeCount).toBe(0);
    expect(response.headers.get("Location")).toBe(`/api/groups/${group.id}`);

    const [row] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(row?.activeGroupId).toBe(group.id);
  });

  test("rejects a second group with the same name for the same user", async () => {
    const owner = await createUser("Dup");
    await createGroup(owner, "Kochbuch");
    const response = await call("/api/groups", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "kochbuch" },
    });
    expect(response.status).toBe(409);
    expect((await body<ErrorPayload>(response)).error.code).toBe("group_name_taken");
  });

  test("needs a session", async () => {
    const response = await call("/api/groups", { method: "POST", body: { name: "Nope" } });
    expect(response.status).toBe(401);
  });

  test("validates the body with 422", async () => {
    const owner = await createUser("Invalid");
    const response = await call("/api/groups", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "" },
    });
    expect(response.status).toBe(422);
    expect((await body<ErrorPayload>(response)).error.code).toBe("validation_failed");
  });
});

describe("GET /api/groups", () => {
  test("lists only the caller's groups with role and counts", async () => {
    const owner = await createUser("Lister");
    const stranger = await createUser("Stranger");
    const groupId = await createGroup(owner, "Meine Rezepte");
    await db
      .insert(recipes)
      .values({
        id: crypto.randomUUID(),
        groupId,
        title: "Pfannkuchen",
        titleFold: foldText("Pfannkuchen"),
        descriptionFold: "",
        createdBy: owner.id,
      });

    const mine = await body<{ items: GroupPayload["group"][] }>(
      await call("/api/groups", { cookie: owner.cookie }),
    );
    const entry = mine.items.find((item) => item.id === groupId);
    expect(entry?.role).toBe("owner");
    expect(entry?.recipeCount).toBe(1);
    expect(entry?.memberCount).toBe(1);

    const theirs = await body<{ items: GroupPayload["group"][] }>(
      await call("/api/groups", { cookie: stranger.cookie }),
    );
    expect(theirs.items.some((item) => item.id === groupId)).toBe(false);
  });
});

describe("group access", () => {
  test("a non-member cannot read the group", async () => {
    const owner = await createUser("Keeper");
    const outsider = await createUser("Outsider");
    const groupId = await createGroup(owner, "Privat");

    const response = await call(`/api/groups/${groupId}`, { cookie: outsider.cookie });
    expect([403, 404]).toContain(response.status);

    const members = await call(`/api/groups/${groupId}/members`, { cookie: outsider.cookie });
    expect([403, 404]).toContain(members.status);
  });

  test("an unknown group is a 404", async () => {
    const owner = await createUser("Ghost");
    const response = await call(`/api/groups/${crypto.randomUUID()}`, { cookie: owner.cookie });
    expect(response.status).toBe(404);
  });
});

describe("invites", () => {
  interface InvitePayload {
    invite: { id: string; token: string; role: string; status: string; email: string };
    inviteUrl: string;
    emailSent?: boolean;
    mailDelivery?: string;
  }

  /**
   * A transport that claims not to be the console one. `mailDelivery` is derived
   * from the transport NAME, because the ConsoleMailer's `send()` resolves as
   * happily as a real relay's — which is what used to make "no mail configured"
   * indistinguishable from a delivery.
   *
   * `setMailer` is process-wide and `bun test` runs every file in one process, so
   * the afterEach below MUST hand it back (see CLAUDE.md).
   */
  class FakeRelay implements Mailer {
    readonly name = "smtp";
    constructor(private readonly rejects = false) {}
    async send(): Promise<void> {
      if (this.rejects) throw new Error("relay lehnt ab");
    }
  }

  afterEach(() => setMailer(null));

  async function invite(
    owner: TestUser,
    groupId: string,
    email: string,
    role = "member",
  ): Promise<InvitePayload> {
    const response = await call(`/api/groups/${groupId}/invites`, {
      method: "POST",
      cookie: owner.cookie,
      body: { email, role },
    });
    expect(response.status).toBe(201);
    return body<InvitePayload>(response);
  }

  test("the invite reports what became of its mail, and stays valid either way", async () => {
    const owner = await createUser("Postmaster");
    const groupId = await createGroup(owner, "Mailtest");

    // Default under `bun test`: a silent ConsoleMailer. It RESOLVES, so this is the
    // case a `delivered` boolean used to report as "an e-mail is on its way".
    const unconfigured = await invite(owner, groupId, "a@toon.test");
    expect(unconfigured.mailDelivery).toBe("not_configured");
    expect(unconfigured.emailSent).toBe(false);

    setMailer(new FakeRelay());
    const sent = await invite(owner, groupId, "b@toon.test");
    expect(sent.mailDelivery).toBe("sent");
    expect(sent.emailSent).toBe(true);

    setMailer(new FakeRelay(true));
    const failed = await invite(owner, groupId, "c@toon.test");
    expect(failed.mailDelivery).toBe("failed");
    expect(failed.emailSent).toBe(false);
    // Still 201 (asserted in `invite()`) with a usable link: a refused mail must
    // not throw away an invite that can be forwarded by hand.
    expect(failed.inviteUrl).toContain(`/invite/${failed.invite.token}`);
    const preview = await call(`/api/groups/invites/${failed.invite.token}`);
    expect(preview.status).toBe(200);
  });

  test("admin invites, anybody can preview, invitee joins as member", async () => {
    const owner = await createUser("Host");
    const guest = await createUser("Guest");
    const groupId = await createGroup(owner, "Familie");

    const created = await invite(owner, groupId, guest.email);
    expect(created.invite.status).toBe("pending");
    expect(created.inviteUrl).toContain(`/invite/${created.invite.token}`);

    // public preview, no cookie at all
    const preview = await call(`/api/groups/invites/${created.invite.token}`);
    expect(preview.status).toBe(200);
    const previewBody = await body<{ groupName: string; invitedByName: string; role: string }>(
      preview,
    );
    expect(previewBody.groupName).toBe("Familie");
    expect(previewBody.invitedByName).toBe(owner.name);
    expect(previewBody.role).toBe("member");

    const accepted = await call("/api/groups/invites/accept", {
      method: "POST",
      cookie: guest.cookie,
      body: { token: created.invite.token },
    });
    expect(accepted.status).toBe(200);
    const acceptedBody = await body<{
      group: { id: string; role: string; memberCount: number };
      member: { role: string; user: { email: string } };
    }>(accepted);
    expect(acceptedBody.group.id).toBe(groupId);
    expect(acceptedBody.member.role).toBe("member");

    // now a member: reading the group works and shows both members
    const detail = await call(`/api/groups/${groupId}`, { cookie: guest.cookie });
    expect(detail.status).toBe(200);
    const detailBody = await body<{ group: { memberCount: number }; members: unknown[] }>(detail);
    expect(detailBody.members).toHaveLength(2);
    expect(detailBody.group.memberCount).toBe(2);

    // accepting again is idempotent
    const again = await call("/api/groups/invites/accept", {
      method: "POST",
      cookie: guest.cookie,
      body: { token: created.invite.token },
    });
    expect(again.status).toBe(200);
  });

  test("plain members may not invite", async () => {
    const owner = await createUser("Boss");
    const member = await createUser("Helper");
    const groupId = await createGroup(owner, "Team");
    await db
      .insert(groupMembers)
      .values({ id: crypto.randomUUID(), groupId, userId: member.id, role: "member" });

    const response = await call(`/api/groups/${groupId}/invites`, {
      method: "POST",
      cookie: member.cookie,
      body: { email: "x@toon.test" },
    });
    expect(response.status).toBe(403);
  });

  test("inviting an existing member conflicts", async () => {
    const owner = await createUser("Twice");
    const groupId = await createGroup(owner, "Doppelt");
    const response = await call(`/api/groups/${groupId}/invites`, {
      method: "POST",
      cookie: owner.cookie,
      body: { email: owner.email },
    });
    expect(response.status).toBe(409);
  });

  test("expired invites answer 409 invite_expired, revoked ones 404", async () => {
    const owner = await createUser("Timer");
    const guest = await createUser("Late");
    const groupId = await createGroup(owner, "Ablauf");

    const expired = await invite(owner, groupId, guest.email);
    await db
      .update(groupInvites)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(groupInvites.id, expired.invite.id));

    const preview = await call(`/api/groups/invites/${expired.invite.token}`);
    expect(preview.status).toBe(409);
    expect((await body<ErrorPayload>(preview)).error.code).toBe("invite_expired");

    const accept = await call("/api/groups/invites/accept", {
      method: "POST",
      cookie: guest.cookie,
      body: { token: expired.invite.token },
    });
    expect(accept.status).toBe(409);

    const fresh = await invite(owner, groupId, guest.email);
    const revoked = await call(`/api/groups/${groupId}/invites/${fresh.invite.id}`, {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(revoked.status).toBe(204);
    const afterRevoke = await call(`/api/groups/invites/${fresh.invite.token}`);
    expect(afterRevoke.status).toBe(404);
  });

  test("a new invite for the same e-mail revokes the previous one", async () => {
    const owner = await createUser("Resend");
    const groupId = await createGroup(owner, "Nochmal");
    const first = await invite(owner, groupId, "same@toon.test");
    const second = await invite(owner, groupId, "same@toon.test");
    expect(second.invite.token).not.toBe(first.invite.token);

    const listed = await body<{ items: Array<{ token: string; status: string }>; total: number }>(
      await call(`/api/groups/${groupId}/invites`, { cookie: owner.cookie }),
    );
    expect(listed.total).toBe(2);
    expect(listed.items.find((item) => item.token === first.invite.token)?.status).toBe("revoked");
    expect(listed.items.find((item) => item.token === second.invite.token)?.status).toBe("pending");
  });
});

describe("members and roles", () => {
  interface MemberPayload {
    member: { userId: string; role: string };
  }

  /** owner + one extra member with the given role. */
  async function setup(role: "member" | "admin") {
    const owner = await createUser("Chief");
    const other = await createUser("Second");
    const groupId = await createGroup(owner, `Rollen ${crypto.randomUUID().slice(0, 6)}`);
    await db
      .insert(groupMembers)
      .values({ id: crypto.randomUUID(), groupId, userId: other.id, role });
    return { owner, other, groupId };
  }

  test("owner promotes a member to admin", async () => {
    const { owner, other, groupId } = await setup("member");
    const response = await call(`/api/groups/${groupId}/members/${other.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { role: "admin" },
    });
    expect(response.status).toBe(200);
    expect((await body<MemberPayload>(response)).member.role).toBe("admin");
  });

  test("an admin may not hand out the owner role", async () => {
    const { other, groupId } = await setup("admin");
    const third = await createUser("Third");
    await db
      .insert(groupMembers)
      .values({ id: crypto.randomUUID(), groupId, userId: third.id, role: "member" });

    const response = await call(`/api/groups/${groupId}/members/${third.id}`, {
      method: "PATCH",
      cookie: other.cookie,
      body: { role: "owner" },
    });
    expect(response.status).toBe(403);
  });

  test("ownership transfer demotes the previous owner to admin", async () => {
    const { owner, other, groupId } = await setup("member");
    const response = await call(`/api/groups/${groupId}/members/${other.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { role: "owner" },
    });
    expect(response.status).toBe(200);
    expect((await body<MemberPayload>(response)).member.role).toBe("owner");

    const members = await body<{ items: Array<{ userId: string; role: string }> }>(
      await call(`/api/groups/${groupId}/members`, { cookie: owner.cookie }),
    );
    expect(members.items.find((item) => item.userId === owner.id)?.role).toBe("admin");
    expect(members.items.filter((item) => item.role === "owner")).toHaveLength(1);
  });

  test("the last owner can neither be demoted nor leave", async () => {
    const { owner, groupId } = await setup("member");

    const demote = await call(`/api/groups/${groupId}/members/${owner.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { role: "member" },
    });
    expect(demote.status).toBe(409);
    expect((await body<ErrorPayload>(demote)).error.code).toBe("last_owner");

    const leave = await call(`/api/groups/${groupId}/members/${owner.id}`, {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(leave.status).toBe(409);
    expect((await body<ErrorPayload>(leave)).error.code).toBe("last_owner");
  });

  test("a member may leave, an admin may remove others, nobody may remove the owner", async () => {
    const { owner, other, groupId } = await setup("member");

    const leave = await call(`/api/groups/${groupId}/members/${other.id}`, {
      method: "DELETE",
      cookie: other.cookie,
    });
    expect(leave.status).toBe(204);
    expect([403, 404]).toContain(
      (await call(`/api/groups/${groupId}`, { cookie: other.cookie })).status,
    );

    const admin = await createUser("Admin");
    const victim = await createUser("Victim");
    await db.insert(groupMembers).values([
      { id: crypto.randomUUID(), groupId, userId: admin.id, role: "admin" },
      { id: crypto.randomUUID(), groupId, userId: victim.id, role: "member" },
    ]);

    expect(
      (
        await call(`/api/groups/${groupId}/members/${victim.id}`, {
          method: "DELETE",
          cookie: admin.cookie,
        })
      ).status,
    ).toBe(204);

    expect(
      (
        await call(`/api/groups/${groupId}/members/${owner.id}`, {
          method: "DELETE",
          cookie: admin.cookie,
        })
      ).status,
    ).toBe(403);
  });

  test("patching an unrelated user is a 404", async () => {
    const { owner, groupId } = await setup("member");
    const response = await call(`/api/groups/${groupId}/members/${crypto.randomUUID()}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { role: "admin" },
    });
    expect(response.status).toBe(404);
  });
});

describe("update and delete a group", () => {
  test("admins rename, members do not", async () => {
    const owner = await createUser("Renamer");
    const member = await createUser("Plain");
    const groupId = await createGroup(owner, "Alt");
    await db
      .insert(groupMembers)
      .values({ id: crypto.randomUUID(), groupId, userId: member.id, role: "member" });

    const denied = await call(`/api/groups/${groupId}`, {
      method: "PATCH",
      cookie: member.cookie,
      body: { name: "Neu" },
    });
    expect(denied.status).toBe(403);

    const allowed = await call(`/api/groups/${groupId}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { name: "Neu", description: "Beschreibung" },
    });
    expect(allowed.status).toBe(200);
    expect((await body<GroupPayload>(allowed)).group.name).toBe("Neu");
  });

  test("only the owner deletes, and everything cascades", async () => {
    const owner = await createUser("Eraser");
    const admin = await createUser("Helper2");
    const groupId = await createGroup(owner, "Weg damit");
    await db
      .insert(groupMembers)
      .values({ id: crypto.randomUUID(), groupId, userId: admin.id, role: "admin" });
    await db
      .insert(recipes)
      .values({
        id: crypto.randomUUID(),
        groupId,
        title: "Suppe",
        titleFold: foldText("Suppe"),
        descriptionFold: "",
        createdBy: owner.id,
      });

    expect(
      (await call(`/api/groups/${groupId}`, { method: "DELETE", cookie: admin.cookie })).status,
    ).toBe(403);

    expect(
      (await call(`/api/groups/${groupId}`, { method: "DELETE", cookie: owner.cookie })).status,
    ).toBe(204);

    expect(await db.select().from(groups).where(eq(groups.id, groupId))).toHaveLength(0);
    expect(await db.select().from(recipes).where(eq(recipes.groupId, groupId))).toHaveLength(0);
    expect(await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId))).toHaveLength(0);
  });
});
