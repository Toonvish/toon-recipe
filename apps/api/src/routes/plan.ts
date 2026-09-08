/**
 * OWNER: plan agent.
 *
 * Mounted at /api/groups/:groupId/plan (see src/index.ts), so the paths declared
 * here are relative: "/", "/:entryId".
 *
 * Auth: `requireSession()` + `requireGroupRole("member")` + `requireVerifiedEmail()`
 * all run as router-level middleware for EVERY route below — the uniform
 * `recipeRoutes` pattern (every write here is gated the same way), not
 * `groupRoutes`'s per-route one. `requireGroupRole` resolves the group from
 * `:groupId`, which every path here carries; `entryId` is deliberately NOT added
 * to `RESOURCE_PARAMS` in `middleware/group.ts` — the service scopes an entry by
 * `and(eq(id), eq(groupId))`, so a cross-group id answers 404 rather than leaking.
 *
 * ANY MEMBER may plan or unplan ANY entry — a shared week is shared property, the
 * same rule `updateShoppingList` already applies to renaming a shopping list. There
 * is no `assertCanModifyOwned` call anywhere in this file.
 *
 * Endpoint contract: docs/API.md (section "Meal plan").
 */
import { zValidator } from "@hono/zod-validator";
import {
  CreateMealPlanEntryRequestSchema,
  MealPlanRangeQuerySchema,
  UpdateMealPlanEntryRequestSchema,
} from "@toon/shared";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { created, json, noContent } from "../lib/http.ts";
import type { AppEnv } from "../lib/types.ts";
import { requireMembership, requireUser } from "../lib/types.ts";
import { requireGroupRole, requireSession, requireVerifiedEmail } from "../services/groups/access.ts";
import { onValidationError } from "../services/groups/validation.ts";
import {
  createPlanEntry,
  deletePlanEntry,
  listPlanEntries,
  updatePlanEntry,
} from "../services/plan/plan.service.ts";

export const planRoutes = new Hono<AppEnv>();

planRoutes.use("*", requireSession());
planRoutes.use("*", requireGroupRole("member"));
// A confirmed address for every WRITE below (GETs pass through) — see
// middleware/verifiedEmail.ts. Mounted once so a route added later is gated by
// default, same as recipeRoutes.
planRoutes.use("*", requireVerifiedEmail());

/**
 * GET /?from&to — flat, `(plannedOn, position)`-ordered range read. A day with
 * nothing planned is simply absent; the seven-slot week (incl. the "+ Plan"
 * empty cards) is built client-side.
 */
planRoutes.get(
  "/",
  zValidator("query", MealPlanRangeQuerySchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const { from, to } = c.req.valid("query");
    const items = await listPlanEntries(db, membership.groupId, from, to);
    return json(c, { from, to, items });
  },
);

/**
 * POST / — plans a recipe on a day. Idempotent: 201 for a new entry, 200 when the
 * recipe was already planned that day (the second call's `servings` still applies).
 */
planRoutes.post(
  "/",
  zValidator("json", CreateMealPlanEntryRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const user = requireUser(c);
    const { entry, created: isNew } = await createPlanEntry(
      db,
      membership.groupId,
      user.id,
      c.req.valid("json"),
    );
    return isNew
      ? created(c, { entry }, `/api/groups/${membership.groupId}/plan/${entry.id}`)
      : json(c, { entry });
  },
);

/**
 * PATCH /:entryId — move to another day (re-tailing `position` on the target
 * day), change servings, or re-order within a day. Any member may edit any entry.
 */
planRoutes.patch(
  "/:entryId",
  zValidator("json", UpdateMealPlanEntryRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const entry = await updatePlanEntry(
      db,
      membership.groupId,
      c.req.param("entryId"),
      c.req.valid("json"),
    );
    return json(c, { entry });
  },
);

/** DELETE /:entryId — unplans. Any member may remove any entry. */
planRoutes.delete("/:entryId", async (c) => {
  const membership = requireMembership(c);
  await deletePlanEntry(db, membership.groupId, c.req.param("entryId"));
  return noContent(c);
});
