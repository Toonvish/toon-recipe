import { z } from "zod";
import { IdSchema } from "./common.ts";
import { GroupWithRoleSchema } from "./group.ts";
import { UserSchema } from "./user.ts";

/** Returned by register + login. The session cookie is set by the response headers. */
export const AuthSessionResponseSchema = z.object({
  user: UserSchema,
  groups: z.array(GroupWithRoleSchema),
  activeGroupId: IdSchema.nullish(),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

/** GET /api/auth/me — identical payload, so the web app has one bootstrap shape. */
export const MeResponseSchema = AuthSessionResponseSchema;
export type MeResponse = z.infer<typeof MeResponseSchema>;
