/**
 * The offline-cache allow-list and the per-account key.
 *
 * These are the two things that stand between "browse your recipes in the kitchen"
 * and "user B sees user A's recipes on a shared phone", so they get pinned down
 * here rather than only in the prose of persist.ts.
 *
 * Pure functions only — `bun test` has no IndexedDB, and the storage helpers
 * already degrade silently without `window` (see lib/storage.ts). `bun:test` types
 * come from the ambient shim at src/features/import/lib/bun-test.d.ts.
 */
import { describe, expect, test } from "bun:test";
import { cacheKeyForUser, shouldPersistMutation, shouldPersistQuery } from "./persist";

type QueryLike = Parameters<typeof shouldPersistQuery>[0];

/** A successful query with some data, which is the only persistable shape. */
function query(queryKey: readonly unknown[], overrides: Partial<QueryLike["state"]> = {}): QueryLike {
  return {
    queryKey: queryKey as QueryLike["queryKey"],
    state: { status: "success", data: { items: [] }, ...overrides } as QueryLike["state"],
  };
}

describe("cacheKeyForUser", () => {
  test("namespaces by user id — two accounts can never read one blob", () => {
    expect(cacheKeyForUser("a1")).toBe("user:a1");
    expect(cacheKeyForUser("a1")).not.toBe(cacheKeyForUser("b2"));
  });
});

describe("shouldPersistQuery — what MAY be written", () => {
  const groupId = "11111111-1111-4111-8111-111111111111";

  test("recipe lists, details, tags and collections", () => {
    for (const segment of ["recipes", "recipe", "tags", "collections", "collection", "detail"]) {
      expect(shouldPersistQuery(query(["toon", "group", groupId, segment]))).toBe(true);
    }
  });

  test("shopping lists — the one screen that is also EDITED offline", () => {
    expect(shouldPersistQuery(query(["toon", "group", groupId, "shopping-lists"]))).toBe(true);
    expect(shouldPersistQuery(query(["toon", "group", groupId, "shopping-list", "l1"]))).toBe(true);
  });

  test("a recipe list WITH filters (the key carries a filter object)", () => {
    expect(
      shouldPersistQuery(query(["toon", "group", groupId, "recipes", { sort: "title" }])),
    ).toBe(true);
  });

  test("the bootstrap payload, because offline needs to know who is signed in", () => {
    expect(shouldPersistQuery(query(["toon", "me"]))).toBe(true);
  });
});

describe("shouldPersistQuery — what may NOT be written", () => {
  const groupId = "11111111-1111-4111-8111-111111111111";

  test("import drafts (mid-edit state must come from the server)", () => {
    expect(shouldPersistQuery(query(["toon", "group", groupId, "imports"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "group", groupId, "import", "draft-1"]))).toBe(false);
  });

  test("security surfaces that must always be live", () => {
    expect(shouldPersistQuery(query(["toon", "sessions"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "oauth-providers"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "invite", "token"]))).toBe(false);
  });

  test("group listings and members (not needed offline, so not stored)", () => {
    expect(shouldPersistQuery(query(["toon", "groups"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "group", groupId, "members"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "group", groupId, "invites"]))).toBe(false);
  });

  test("an UNKNOWN key — the list is allow, not deny, so new endpoints are excluded", () => {
    expect(shouldPersistQuery(query(["toon", "group", groupId, "meal-plan"]))).toBe(false);
    expect(shouldPersistQuery(query(["something-else", "recipes"]))).toBe(false);
    expect(shouldPersistQuery(query([]))).toBe(false);
  });

  test("a pending or failed query — restoring it would read as 'no recipes'", () => {
    expect(shouldPersistQuery(query(["toon", "group", groupId, "recipes"], { status: "pending" }))).toBe(
      false,
    );
    expect(shouldPersistQuery(query(["toon", "group", groupId, "recipes"], { status: "error" }))).toBe(
      false,
    );
  });

  test("a successful but empty `me` (logged out) is not worth storing", () => {
    expect(shouldPersistQuery(query(["toon", "me"], { data: null }))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "me"], { data: undefined }))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the write half: queued offline mutations                                   */
/* -------------------------------------------------------------------------- */

type MutationLike = Parameters<typeof shouldPersistMutation>[0];

function mutation(
  mutationKey: readonly unknown[] | undefined,
  overrides: Partial<MutationLike["state"]> = {},
): MutationLike {
  return {
    options: { mutationKey },
    state: { status: "pending", isPaused: true, ...overrides },
  };
}

describe("shouldPersistMutation", () => {
  test("a PAUSED shopping mutation is queued for replay", () => {
    expect(shouldPersistMutation(mutation(["toon", "shopping", "check"]))).toBe(true);
    expect(shouldPersistMutation(mutation(["toon", "shopping", "add-items"]))).toBe(true);
  });

  /**
   * The whole point: a mutation that already reached the server must not be re-run on
   * the next launch. The API's ledger catches a duplicate for calls that carry a
   * mutationId, but this is the first line of defence.
   */
  test("a mutation that is NOT paused is never persisted", () => {
    expect(
      shouldPersistMutation(mutation(["toon", "shopping", "check"], { isPaused: false })),
    ).toBe(false);
    expect(
      shouldPersistMutation(
        mutation(["toon", "shopping", "check"], { isPaused: false, status: "success" }),
      ),
    ).toBe(false);
  });

  test("other features are excluded — replaying a recipe delete hours later is not a nicety", () => {
    expect(shouldPersistMutation(mutation(["toon", "recipes", "delete"]))).toBe(false);
    expect(shouldPersistMutation(mutation(["toon", "auth", "logout"]))).toBe(false);
    expect(shouldPersistMutation(mutation(["toon", "groups", "update-role"]))).toBe(false);
  });

  test("an unkeyed or foreign mutation is excluded", () => {
    expect(shouldPersistMutation(mutation(undefined))).toBe(false);
    expect(shouldPersistMutation(mutation([]))).toBe(false);
    expect(shouldPersistMutation(mutation(["other", "shopping"]))).toBe(false);
  });
});
