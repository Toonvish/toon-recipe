/**
 * OWNER: groups agent.
 *
 * Mounted at /api/groups (see src/index.ts). Groups, memberships, roles and
 * invites. Membership is verified exclusively by `requireGroupRole(...)`
 * (src/services/groups/access.ts bridges to the auth agent's middleware) —
 * there is not a single inline membership check below.
 *
 * The two fixed /invites/... routes are registered BEFORE the /:groupId routes,
 * otherwise "invites" would be captured as a groupId.
 *
 * `requireVerifiedEmail()` is applied PER ROUTE here, not with `use("*")` as the
 * recipe/import/shopping routers do, because this file's writes are deliberately
 * NOT uniform (services/auth/verifiedEmail.ts explains the gate itself):
 *
 *   gated    POST /  ·  PATCH /:groupId  ·  DELETE /:groupId  ·  POST /:groupId/invites
 *            — creating groups and mailing invitations is the spam surface.
 *   ungated  POST /invites/accept — the one write an unconfirmed account MUST
 *            keep, or an invited flatmate cannot get in at all.
 *   ungated  the member routes — leaving a group ("Gruppe verlassen") and role
 *            changes are neither spam nor content, and trapping somebody in a
 *            group they cannot leave is a worse outcome than the thing gated.
 *   ungated  DELETE /:groupId/invites/:inviteId — revoking is the UNDO for the
 *            gated create; blocking it could only strand a live invitation.
 *
 * A `use("*")` here would silently swallow the accept route, i.e. the escape
 * hatch, so a new write added below needs its own line and a decision.
 *
 * Endpoint contract: docs/API.md (section "Groups").
 */
import { zValidator } from "@hono/zod-validator";
import {
  AcceptInviteRequestSchema,
  CreateGroupRequestSchema,
  CreateInviteRequestSchema,
  PaginationQuerySchema,
  UpdateGroupRequestSchema,
  UpdateMemberRoleRequestSchema,
} from "@toon/shared";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { created, json, noContent } from "../lib/http.ts";
import type { AppEnv } from "../lib/types.ts";
import { requireMembership, requireUser } from "../lib/types.ts";
import { requireGroupRole, requireSession, requireVerifiedEmail } from "../services/groups/access.ts";
import {
  createGroup,
  deleteGroup,
  getGroupWithRole,
  listGroupsForUser,
  listMembers,
  removeMember,
  updateGroup,
  updateMemberRole,
} from "../services/groups/groups.service.ts";
import {
  acceptInvite,
  createInvite,
  listInvites,
  previewInvite,
  revokeInvite,
} from "../services/groups/invites.service.ts";
import { onValidationError } from "../services/groups/validation.ts";

export const groupRoutes = new Hono<AppEnv>();

/* -------------------------------------------------------------------------- */
/* my groups                                                                  */
/* -------------------------------------------------------------------------- */

/** GET /api/groups — every group of the caller incl. role + counts. */
groupRoutes.get("/", requireSession(), async (c) => {
  const user = requireUser(c);
  return json(c, { items: await listGroupsForUser(db, user.id) });
});

/** POST /api/groups — the caller becomes owner and the group becomes active. */
groupRoutes.post(
  "/",
  requireSession(),
  requireVerifiedEmail(),
  zValidator("json", CreateGroupRequestSchema, onValidationError),
  async (c) => {
    const user = requireUser(c);
    const group = await createGroup(db, user.id, c.req.valid("json"));
    return created(c, { group }, `/api/groups/${group.id}`);
  },
);

/* -------------------------------------------------------------------------- */
/* invites (fixed paths — MUST stay above /:groupId)                          */
/* -------------------------------------------------------------------------- */

/** GET /api/groups/invites/:token — public preview for the landing page. */
groupRoutes.get("/invites/:token", async (c) => json(c, await previewInvite(db, c.req.param("token"))));

/** POST /api/groups/invites/accept — join the group behind a token. */
groupRoutes.post(
  "/invites/accept",
  requireSession(),
  zValidator("json", AcceptInviteRequestSchema, onValidationError),
  async (c) => {
    const user = requireUser(c);
    return json(c, await acceptInvite(db, user.id, c.req.valid("json").token));
  },
);

/* -------------------------------------------------------------------------- */
/* one group                                                                  */
/* -------------------------------------------------------------------------- */

/** GET /api/groups/:groupId — group + members. */
groupRoutes.get("/:groupId", requireSession(), requireGroupRole("member"), async (c) => {
  const membership = requireMembership(c);
  const [group, members] = await Promise.all([
    getGroupWithRole(db, membership.groupId, membership.role),
    listMembers(db, membership.groupId),
  ]);
  return json(c, { group, members });
});

/** PATCH /api/groups/:groupId — rename/describe (admin+). */
groupRoutes.patch(
  "/:groupId",
  requireSession(),
  requireGroupRole("admin"),
  requireVerifiedEmail(),
  zValidator("json", UpdateGroupRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const group = await updateGroup(db, membership.groupId, membership.role, c.req.valid("json"));
    return json(c, { group });
  },
);

/** DELETE /api/groups/:groupId — owner only; all content cascades. */
groupRoutes.delete("/:groupId", requireSession(), requireGroupRole("owner"), requireVerifiedEmail(), async (c) => {
  const membership = requireMembership(c);
  await deleteGroup(db, membership.groupId);
  return noContent(c);
});

/* -------------------------------------------------------------------------- */
/* members                                                                    */
/* -------------------------------------------------------------------------- */

/** GET /api/groups/:groupId/members */
groupRoutes.get("/:groupId/members", requireSession(), requireGroupRole("member"), async (c) => {
  const membership = requireMembership(c);
  return json(c, { items: await listMembers(db, membership.groupId) });
});

/** PATCH /api/groups/:groupId/members/:userId — role change / ownership transfer. */
groupRoutes.patch(
  "/:groupId/members/:userId",
  requireSession(),
  requireGroupRole("admin"),
  zValidator("json", UpdateMemberRoleRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const member = await updateMemberRole(
      db,
      membership,
      c.req.param("userId"),
      c.req.valid("json").role,
    );
    return json(c, { member });
  },
);

/**
 * DELETE /api/groups/:groupId/members/:userId
 * Admins remove others, everybody may remove themselves ("Gruppe verlassen"),
 * which is why this route only requires `member` and delegates the rank rules
 * to removeMember().
 */
groupRoutes.delete(
  "/:groupId/members/:userId",
  requireSession(),
  requireGroupRole("member"),
  async (c) => {
    const membership = requireMembership(c);
    await removeMember(db, membership, c.req.param("userId"));
    return noContent(c);
  },
);

/* -------------------------------------------------------------------------- */
/* invites of a group (admin+)                                                */
/* -------------------------------------------------------------------------- */

/** GET /api/groups/:groupId/invites */
groupRoutes.get(
  "/:groupId/invites",
  requireSession(),
  requireGroupRole("admin"),
  zValidator("query", PaginationQuerySchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    return json(c, await listInvites(db, membership.groupId, c.req.valid("query")));
  },
);

/** POST /api/groups/:groupId/invites — returns the shareable inviteUrl. */
groupRoutes.post(
  "/:groupId/invites",
  requireSession(),
  requireGroupRole("admin"),
  requireVerifiedEmail(),
  zValidator("json", CreateInviteRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const user = requireUser(c);
    const result = await createInvite(db, membership.groupId, user.id, c.req.valid("json"));
    return created(c, result);
  },
);

/** DELETE /api/groups/:groupId/invites/:inviteId */
groupRoutes.delete(
  "/:groupId/invites/:inviteId",
  requireSession(),
  requireGroupRole("admin"),
  async (c) => {
    const membership = requireMembership(c);
    await revokeInvite(db, membership.groupId, c.req.param("inviteId"));
    return noContent(c);
  },
);

export default groupRoutes;
