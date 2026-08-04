/**
 * The single import point for the auth middleware used by routes/groups.ts and
 * routes/recipes.ts.
 *
 * Authentication and group authorisation are OWNED BY THE AUTH AGENT
 * (src/middleware/session.ts, src/middleware/group.ts) — nothing is
 * re-implemented here. Re-exporting through this module means that if those
 * files are ever renamed/merged (the brief called them `middleware/auth.ts`),
 * exactly one line has to change instead of every route.
 */
export { requireGroupRole } from "../../middleware/group.ts";
export { optionalSession, requireSession } from "../../middleware/session.ts";
