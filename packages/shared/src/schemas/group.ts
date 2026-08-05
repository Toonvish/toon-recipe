import { z } from "zod";
import { IdSchema, IsoDateSchema, MailDeliverySchema, listResponse } from "./common.ts";
import { EmailSchema, PublicUserSchema } from "./user.ts";

/** owner > admin > member. Exactly one owner per group at any time. */
export const GroupRoleSchema = z.enum(["owner", "admin", "member"]);
export type GroupRole = z.infer<typeof GroupRoleSchema>;

/** Roles that can be handed out in an invite (never "owner"). */
export const InvitableRoleSchema = z.enum(["admin", "member"]);
export type InvitableRole = z.infer<typeof InvitableRoleSchema>;

export const ROLE_RANK: Record<GroupRole, number> = { member: 1, admin: 2, owner: 3 };

/** True when `role` satisfies `required` (owner satisfies admin, etc.). */
export function roleAtLeast(role: GroupRole, required: GroupRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const GroupSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
  createdBy: IdSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Group = z.infer<typeof GroupSchema>;

/** A group plus the calling user's relationship to it — what the switcher renders. */
export const GroupWithRoleSchema = GroupSchema.extend({
  role: GroupRoleSchema,
  memberCount: z.number().int().nonnegative(),
  recipeCount: z.number().int().nonnegative(),
});
export type GroupWithRole = z.infer<typeof GroupWithRoleSchema>;

export const GroupMemberSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  userId: IdSchema,
  role: GroupRoleSchema,
  createdAt: IsoDateSchema,
  user: PublicUserSchema,
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const InviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

export const GroupInviteSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  email: z.string(),
  role: InvitableRoleSchema,
  /** Shareable token; only ever returned to admins/owners of the group. */
  token: z.string(),
  status: InviteStatusSchema,
  invitedBy: IdSchema,
  invitedByName: z.string(),
  expiresAt: IsoDateSchema,
  createdAt: IsoDateSchema,
  acceptedAt: IsoDateSchema.nullish(),
});
export type GroupInvite = z.infer<typeof GroupInviteSchema>;

/* ------------------------------- requests -------------------------------- */

export const CreateGroupRequestSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(80),
  description: z.string().trim().max(500).optional(),
});
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;

export const UpdateGroupRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullish(),
    imageUrl: z.string().max(1000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "Keine Änderungen übergeben");
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;

export const CreateInviteRequestSchema = z.object({
  email: EmailSchema,
  role: InvitableRoleSchema.default("member"),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

export const UpdateMemberRoleRequestSchema = z.object({
  role: GroupRoleSchema,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

export const AcceptInviteRequestSchema = z.object({
  token: z.string().min(10).max(200),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;

/* ------------------------------- responses ------------------------------- */

export const GroupResponseSchema = z.object({ group: GroupWithRoleSchema });
export type GroupResponse = z.infer<typeof GroupResponseSchema>;

export const GroupListResponseSchema = z.object({ items: z.array(GroupWithRoleSchema) });
export type GroupListResponse = z.infer<typeof GroupListResponseSchema>;

export const GroupDetailResponseSchema = z.object({
  group: GroupWithRoleSchema,
  members: z.array(GroupMemberSchema),
});
export type GroupDetailResponse = z.infer<typeof GroupDetailResponseSchema>;

export const GroupMemberResponseSchema = z.object({ member: GroupMemberSchema });
export type GroupMemberResponse = z.infer<typeof GroupMemberResponseSchema>;

export const GroupMemberListResponseSchema = z.object({ items: z.array(GroupMemberSchema) });
export type GroupMemberListResponse = z.infer<typeof GroupMemberListResponseSchema>;

export const GroupInviteResponseSchema = z.object({
  invite: GroupInviteSchema,
  /**
   * Ready-to-share link built from WEB_ORIGIN. THE SOURCE OF TRUTH — the invite is
   * valid because this row exists, whether or not a mail went out, so the UI always
   * shows the copyable link.
   */
  inviteUrl: z.string(),
  /**
   * Whether an invite e-mail really went out — i.e. `mailDelivery === "sent"`.
   *
   * Kept for older clients; new code reads `mailDelivery`, which says WHICH of the
   * two non-deliveries happened. Note this is false for an install with no
   * MAIL_TRANSPORT: the ConsoleMailer logging the link is not a delivery, and
   * reporting it as one is what made the UI promise a mail nobody would get.
   */
  emailSent: z.boolean().optional(),
  /**
   * Why no mail arrived, when none did. Optional so an older client keeps working
   * and a newer client can treat a server that predates the field as "unknown"
   * (fall back to `emailSent`). Creating the invite succeeded either way — the
   * `inviteUrl` above is the source of truth.
   */
  mailDelivery: MailDeliverySchema.optional(),
});
export type GroupInviteResponse = z.infer<typeof GroupInviteResponseSchema>;

export const GroupInviteListResponseSchema = listResponse(GroupInviteSchema);
export type GroupInviteListResponse = z.infer<typeof GroupInviteListResponseSchema>;

/** Public preview shown on the "Du wurdest eingeladen" landing page. */
export const InvitePreviewResponseSchema = z.object({
  groupName: z.string(),
  invitedByName: z.string(),
  email: z.string(),
  role: InvitableRoleSchema,
  status: InviteStatusSchema,
  expiresAt: IsoDateSchema,
});
export type InvitePreviewResponse = z.infer<typeof InvitePreviewResponseSchema>;

export const AcceptInviteResponseSchema = z.object({
  group: GroupWithRoleSchema,
  member: GroupMemberSchema,
});
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
