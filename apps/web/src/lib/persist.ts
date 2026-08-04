/**
 * Offline persistence of the TanStack Query cache — the "usable in a kitchen with bad
 * wifi" half of the app.
 *
 * Reads are cached for every screen on the allow-list ({@link shouldPersistQuery}).
 * WRITES are cached for exactly one feature: paused shopping-list mutations
 * ({@link shouldPersistMutation}), so items can be ticked off in a supermarket
 * basement and replayed on reconnect. Everything else stays read-only offline.
 *
 * IndexedDB, not localStorage: a dehydrated cache with a few dozen recipes blows
 * past localStorage's ~5 MB quota and writing it synchronously on every cache
 * change would jank the main thread. No `idb-keyval` dependency — the store is one
 * object store with one key per account, which is ~40 lines of raw IDB.
 *
 * ## THE DATA-LEAK GUARD, WHICH IS THE POINT OF THIS FILE
 *
 * A persisted cache keyed only by query key would show USER A'S RECIPES TO USER B
 * after a logout/login on a shared phone: the keys are identical
 * (`["toon","group",<id>,"recipes",…]`), and a restore happens before any network
 * call can correct it. Four rules prevent that, and all four have to hold.
 *
 *  1. **The IndexedDB key contains the user id** ({@link cacheKeyForUser}), so two
 *     accounts cannot read each other's blob at all.
 *  2. **The key follows the CURRENT user at write time.** The persister reads
 *     {@link setActiveCacheUser}'s module state on every call instead of closing
 *     over an id — a persister bound at boot would keep saving user B's freshly
 *     loaded recipes under user A's key.
 *  3. **Switching accounts purges first.** {@link setActiveCacheUser} clears the
 *     store whenever the id actually changes, and logout calls it with `null`.
 *  4. **An allow-list decides what is written at all** ({@link shouldPersistQuery}),
 *     so an endpoint added later is excluded by default rather than silently
 *     persisted.
 *
 * ## WHY `/api/auth/me` IS PERSISTED (it is the one judgement call here)
 *
 * Without it there is no offline mode at all: an installed app opened in airplane
 * mode cannot reach `/api/auth/me`, so it would never learn who is signed in, never
 * render past the guard, and never show the recipe it has cached. So the bootstrap
 * payload is persisted too — inside the per-user, purge-on-logout blob above.
 *
 * What that does NOT do is grant access. A restored session is data on a device
 * that already held it; the cookie is still the only thing the API accepts, every
 * write goes to the server, and a 401 clears the cache and redirects to /login
 * (see `handleUnauthorized` in lib/api.ts). `refetchOnReconnect` re-checks the real
 * session the moment there is a connection again.
 *
 * Still excluded: `["toon","sessions"]` and the OAuth provider list (security
 * surfaces that must always be live) and import drafts (mid-edit state that has to
 * come from the server).
 */
import type { Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { readStorage, storageKeys, writeStorage } from "./storage";

const DB_NAME = "toon-recipe";
const DB_VERSION = 1;
const STORE_NAME = "query-cache";

/** How long a persisted cache may still be restored after it was written. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bumped whenever a change would make an old blob wrong (a query-key rename, a
 * response-shape change). A mismatch makes the persister discard the blob instead
 * of hydrating stale-shaped data into components that no longer understand it.
 *
 * v2: the blob now also carries paused shopping-list mutations (see
 * {@link shouldPersistMutation}). A v1 blob has none, which would restore fine — the
 * bump is the conservative choice, and its cost is one cold reload per device.
 */
export const PERSIST_BUSTER = "v2";

/** IndexedDB key of one account's cache. */
export function cacheKeyForUser(userId: string): string {
  return `user:${userId}`;
}

/* -------------------------------------------------------------------------- */
/* which account the cache belongs to                                         */
/* -------------------------------------------------------------------------- */

/**
 * Id of the account the cache is being written for.
 *
 * Seeded from localStorage so a cold, OFFLINE start knows which blob to restore
 * before any network call — that is the whole reason the pointer is stored outside
 * IndexedDB. It is a pointer, never data: worthless on its own.
 */
let activeUserId: string | null = readStorage(storageKeys.lastUserId);

/** The account the persister currently reads and writes. */
export function activeCacheUser(): string | null {
  return activeUserId;
}

/**
 * Points the cache at `userId` (or at nobody, on logout).
 *
 * PURGES whenever the id actually changes — including on logout — so a second
 * person on the same phone can never end up reading the first one's blob, and so a
 * signed-out device stops holding recipes at all. Safe to call on every render of
 * the session provider: an unchanged id does nothing.
 */
export function setActiveCacheUser(userId: string | null): void {
  if (userId === activeUserId) return;
  activeUserId = userId;
  writeStorage(storageKeys.lastUserId, userId);
  void purgePersistedCache();
}

/* -------------------------------------------------------------------------- */
/* raw IndexedDB                                                              */
/* -------------------------------------------------------------------------- */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB.open failed"));
    request.onblocked = () => reject(new Error("indexedDB.open blocked"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    const fail = () => {
      database.close();
      reject(transaction.error ?? new Error("indexedDB transaction failed"));
    };
    transaction.onabort = fail;
    transaction.onerror = fail;
  });
}

/** True when this browser can persist at all (private-mode Safari cannot). */
export function isPersistenceAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/* -------------------------------------------------------------------------- */
/* what may be persisted                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Group-scoped content that is useful offline. `imports` is absent on purpose.
 * Keys look like `["toon","group",<groupId>,<segment>,…]`.
 */
const PERSISTED_GROUP_SEGMENTS = new Set([
  "recipes",
  "recipe",
  "tags",
  "collections",
  "collection",
  "detail",
  // The shopping list is the one screen that is EDITED offline (in a supermarket
  // basement), so both the overview and the open list have to survive a cold start.
  "shopping-lists",
  "shopping-list",
]);

/** The bootstrap payload — see "WHY /api/auth/me IS PERSISTED" in the header. */
function isBootstrapKey(key: readonly unknown[]): boolean {
  return key[1] === "me" && key.length === 2;
}

/**
 * The allow-list. Everything not named here stays in memory only.
 */
export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  // Never persist a pending or failed query: it would restore as "no recipes"
  // rather than as "not loaded yet", which reads as data loss.
  if (query.state.status !== "success") return false;
  // `me` legitimately resolves to null (logged out) — that is not worth storing.
  if (query.state.data === null || query.state.data === undefined) return false;

  const key = query.queryKey;
  if (!Array.isArray(key) || key[0] !== "toon") return false;
  if (isBootstrapKey(key)) return true;
  if (key[1] !== "group") return false;
  const segment = key[3];
  return typeof segment === "string" && PERSISTED_GROUP_SEGMENTS.has(segment);
}

/* -------------------------------------------------------------------------- */
/* the WRITE half: queued offline mutations                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mutation keys whose PAUSED state is persisted, so a shopping-list edit made in
 * airplane mode survives the app being killed and is replayed on reconnect.
 *
 * This is the one place the offline cache is not read-only, so it is deliberately a
 * tiny allow-list rather than "all mutations". Three things have to hold for a key to
 * belong here, and shopping mutations are currently the only ones that do:
 *
 *  1. **The mutation must be registered with `setMutationDefaults`.** A dehydrated
 *     mutation carries its VARIABLES but not its `mutationFn` — a function cannot be
 *     serialised. Without a default registered for the key at app start, a restored
 *     mutation has nothing to run and `resumePausedMutations()` throws. See
 *     features/shopping/lib/offline.ts, which is imported for that side effect.
 *  2. **The server endpoint must be replay-safe.** Every queued mutation carries a
 *     `mutationId`, and the API's ledger applies each id at most once — otherwise a
 *     replayed "add recipe" would silently DOUBLE the amounts (see
 *     apps/api/src/services/shopping/idempotency.ts).
 *  3. **A stale replay must not be destructive.** These mutations add lines or tick
 *     them off; the worst outcome of a late replay is an item you re-tick.
 *
 * Auth, group and recipe mutations are excluded and must stay excluded: replaying a
 * "delete recipe" or a role change hours later, against state the user can no longer
 * see, is not a nicety anyone asked for.
 */
const PERSISTED_MUTATION_KEYS = new Set(["shopping"]);

/**
 * Only PAUSED mutations are worth persisting: a settled one has already reached the
 * server, and re-running it on the next launch is exactly the double-apply the ledger
 * exists to prevent.
 */
export function shouldPersistMutation(mutation: {
  state: { status: string; isPaused: boolean };
  options: { mutationKey?: readonly unknown[] | undefined };
}): boolean {
  if (!mutation.state.isPaused) return false;
  const key = mutation.options.mutationKey;
  if (!Array.isArray(key) || key[0] !== "toon") return false;
  return typeof key[1] === "string" && PERSISTED_MUTATION_KEYS.has(key[1]);
}

/* -------------------------------------------------------------------------- */
/* persister                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The single {@link Persister} for the app, stored under the CURRENT
 * {@link activeCacheUser}'s key — see rule 2 in the header for why the id is read
 * per call rather than captured.
 *
 * Every operation swallows its own failure: persistence is a nicety, and a browser
 * that refuses IndexedDB (private mode, disabled storage, exhausted quota) must
 * degrade to "online only", never break the app.
 */
export function createIndexedDbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const userId = activeCacheUser();
      // Nobody signed in -> nothing may be written. Otherwise a logged-out tab
      // would keep a blob around under a guessable key.
      if (userId === null || !isPersistenceAvailable()) return;
      try {
        await withStore("readwrite", (store) => store.put(client, cacheKeyForUser(userId)));
      } catch {
        /* out of quota / storage disabled — stay online-only */
      }
    },
    restoreClient: async () => {
      const userId = activeCacheUser();
      if (userId === null || !isPersistenceAvailable()) return undefined;
      try {
        return await withStore<PersistedClient | undefined>("readonly", (store) =>
          store.get(cacheKeyForUser(userId)),
        );
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      await purgePersistedCache();
    },
  };
}

/**
 * Deletes EVERY persisted cache, whoever it belongs to.
 *
 * Deliberately not "delete the current key": on a shared phone the person logging
 * out is the one who cares, and a leftover blob from an earlier account is exactly
 * what this feature must not accumulate.
 */
export async function purgePersistedCache(): Promise<void> {
  if (!isPersistenceAvailable()) return;
  try {
    await withStore("readwrite", (store) => store.clear());
  } catch {
    /* nothing we can do, and nothing worth breaking logout over */
  }
}
