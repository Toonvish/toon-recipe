/**
 * Foundation smoke test + the TEMPLATE for every API integration test:
 * spin up an in-memory libSQL DB, run the generated migrations, hit `app`.
 *
 * Feature agents: copy the `createTestDb` pattern below into your own test file.
 */
import { foldText } from "@toon/shared";
import { afterAll, describe, expect, test } from "bun:test";
import { createDatabase } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { groupMembers, groups, recipes, users } from "../src/db/schema.ts";
import { env } from "../src/env.ts";
import { app } from "../src/index.ts";
import { ApiError } from "../src/lib/errors.ts";

const { client, db } = createDatabase({ url: "file::memory:" });
await runMigrations(db);

afterAll(() => {
  client.close();
});

describe("env", () => {
  test("defaults to an in-memory DB under bun test", () => {
    expect(env.DATABASE_URL).toBe("file::memory:");
    expect(env.databaseKind).toBe("file");
    expect(env.webOrigins.length).toBeGreaterThan(0);
  });
});

describe("GET /api/health", () => {
  test("answers 200 with the health payload", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; database: string };
    expect(body.status).toBe("ok");
    expect(body.database).toBe("file");
  });
});

describe("error envelope", () => {
  test("unknown routes use the standard shape", async () => {
    const response = await app.request("/api/does-not-exist");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });

  test("ApiError.toBody() matches the contract", () => {
    const body = ApiError.conflict("email_taken", "E-Mail ist bereits registriert").toBody();
    expect(body).toEqual({ error: { code: "email_taken", message: "E-Mail ist bereits registriert" } });
  });
});

describe("router mounts exist", () => {
  /**
   * INTEGRATION FIX: this test originally expected 404 everywhere, which was only
   * correct while the routers were empty. Now that the real routes exist, an
   * unauthenticated GET on a guarded router is a 401 from the session middleware —
   * that IS the proof the router is mounted. `/api/auth/login` stays a 404 because
   * only POST is registered for it.
   */
  const expected: Record<string, number> = {
    "/api/auth/login": 404,
    "/api/groups": 401,
    "/api/groups/x/recipes": 401,
    "/api/groups/x/imports": 401,
  };

  test("the four feature routers are mounted (JSON error, not a crash)", async () => {
    for (const [path, status] of Object.entries(expected)) {
      const response = await app.request(path);
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/json");
    }
  });
});

describe("schema + migrations", () => {
  test("migrations create a usable schema with cascading deletes", async () => {
    const userId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const recipeId = crypto.randomUUID();

    await db.insert(users).values({ id: userId, email: "a@b.de", name: "Tester" });
    await db.insert(groups).values({ id: groupId, name: "Familie", createdBy: userId });
    await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId, userId, role: "owner" });
    await db.insert(recipes).values({
      id: recipeId,
      groupId,
      title: "Pfannkuchen",
      titleFold: foldText("Pfannkuchen"),
      descriptionFold: "",
      createdBy: userId,
    });

    expect(await db.select().from(recipes)).toHaveLength(1);

    await client.execute({ sql: "delete from groups where id = ?", args: [groupId] });
    expect(await db.select().from(recipes)).toHaveLength(0);
    expect(await db.select().from(groupMembers)).toHaveLength(0);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  test("users.email is unique", async () => {
    const first = crypto.randomUUID();
    await db.insert(users).values({ id: first, email: "dup@toon.local", name: "A" });
    const duplicate = async () => {
      await db.insert(users).values({ id: crypto.randomUUID(), email: "dup@toon.local", name: "B" });
    };
    await expect(duplicate()).rejects.toThrow();
  });
});
