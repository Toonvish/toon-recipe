/**
 * Bridge to the auth/group middleware owned by the auth and groups agents.
 *
 * WHY THIS EXISTS: the import router must apply `requireSession` +
 * `requireGroupRole("member")`, but those live in files this agent must not
 * create or edit, and they are written CONCURRENTLY. Two module names were in
 * circulation during the build (`middleware/session.ts` + `middleware/group.ts`
 * per docs/API.md and the foundation notes, vs. a combined `middleware/auth.ts`),
 * so the middleware is resolved LAZILY at first request from a candidate list.
 *
 * Consequences:
 *   - importing routes/imports.ts never fails because of a missing peer module,
 *   - whichever naming the other agents landed on, the routes work,
 *   - if NEITHER exists the route answers 500 with a clear operator message
 *     instead of silently serving group data without an auth check.
 *
 * There is deliberately NO fallback implementation of session/membership checks
 * here: security-critical logic must live in exactly one place.
 */
import type { GroupRole } from "@toon/shared";
import type { MiddlewareHandler } from "hono";
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";
import type { AppEnv } from "../../lib/types.ts";

type Middleware = MiddlewareHandler<AppEnv>;
type RequireGroupRole = (role: GroupRole) => Middleware;

/**
 * Test seam. Because the middleware is resolved per request, an override works
 * regardless of module evaluation order — which `mock.module` cannot guarantee.
 * Refuses to do anything outside NODE_ENV=test so it can never weaken prod.
 */
let sessionOverride: Middleware | null = null;
let groupOverride: RequireGroupRole | null = null;

export function setAuthMiddlewareForTests(session: Middleware | null, group: RequireGroupRole | null): void {
  if (!env.isTest) throw new Error("setAuthMiddlewareForTests is only available under NODE_ENV=test");
  sessionOverride = session;
  groupOverride = group;
}

/** Module paths that may export the session middleware, in order of preference. */
const SESSION_MODULES = ["../../middleware/session.ts", "../../middleware/auth.ts"] as const;
/** Module paths that may export `requireGroupRole`. */
const GROUP_MODULES = ["../../middleware/group.ts", "../../middleware/auth.ts", "../../middleware/groups.ts"] as const;

async function importCandidates(paths: readonly string[]): Promise<Array<Record<string, unknown>>> {
  const modules: Array<Record<string, unknown>> = [];
  for (const path of paths) {
    try {
      modules.push((await import(path)) as Record<string, unknown>);
    } catch {
      // Not present in this build — try the next candidate.
    }
  }
  return modules;
}

let sessionPromise: Promise<Middleware> | null = null;

async function resolveRequireSession(): Promise<Middleware> {
  const modules = await importCandidates(SESSION_MODULES);
  for (const module of modules) {
    const candidate = module.requireSession ?? module.sessionMiddleware ?? module.requireAuth;
    if (typeof candidate === "function") return candidate as Middleware;
  }
  throw new ApiError(
    500,
    "internal_error",
    "Die Authentifizierung ist nicht verfügbar (Session-Middleware fehlt).",
    { expected: SESSION_MODULES, expectedExport: "requireSession" },
  );
}

let groupFactoryPromise: Promise<RequireGroupRole> | null = null;

async function resolveRequireGroupRole(): Promise<RequireGroupRole> {
  const modules = await importCandidates(GROUP_MODULES);
  for (const module of modules) {
    const candidate = module.requireGroupRole ?? module.requireGroupMember ?? module.groupMiddleware;
    if (typeof candidate === "function") return candidate as RequireGroupRole;
  }
  throw new ApiError(
    500,
    "internal_error",
    "Die Gruppenprüfung ist nicht verfügbar (Group-Middleware fehlt).",
    { expected: GROUP_MODULES, expectedExport: "requireGroupRole" },
  );
}

/**
 * `requireSession`, resolved on first use. Behaves exactly like the real
 * middleware; only the module lookup is deferred.
 */
export const requireSession: Middleware = async (c, next) => {
  if (sessionOverride !== null) return await sessionOverride(c, next);
  sessionPromise ??= resolveRequireSession();
  let middleware: Middleware;
  try {
    middleware = await sessionPromise;
  } catch (error) {
    sessionPromise = null; // allow a retry once the peer module lands
    throw error;
  }
  return await middleware(c, next);
};

/**
 * `requireGroupRole(role)`, resolved on first use. Cached per role so the
 * middleware instance is created once.
 */
export function requireGroupRole(role: GroupRole): Middleware {
  let cached: Middleware | null = null;
  return async (c, next) => {
    if (groupOverride !== null) return await groupOverride(role)(c, next);
    if (cached === null) {
      groupFactoryPromise ??= resolveRequireGroupRole();
      let factory: RequireGroupRole;
      try {
        factory = await groupFactoryPromise;
      } catch (error) {
        groupFactoryPromise = null;
        throw error;
      }
      cached = factory(role);
    }
    return await cached(c, next);
  };
}
