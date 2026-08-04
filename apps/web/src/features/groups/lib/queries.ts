/** TanStack Query hooks for groups, members and invites. Keys come from `@/lib/queries`. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptInviteResponse,
  CreateGroupRequest,
  CreateInviteRequest,
  GroupInviteResponse,
  GroupMember,
  GroupRole,
  GroupWithRole,
  UpdateGroupRequest,
} from "@toon/shared";
import {
  acceptInvite,
  createGroup,
  createGroupInvite,
  deleteGroup,
  removeGroupMember,
  revokeGroupInvite,
  updateGroup,
  updateMemberRole,
} from "@/lib/api";
import {
  groupInvitesQuery,
  groupMembersQuery,
  groupQuery,
  groupsQuery,
  invalidate,
  queryKeys,
} from "@/lib/queries";

/** Groups of the current user with role/memberCount/recipeCount. */
export function useGroups() {
  const options = groupsQuery();
  return useQuery({ ...options, select: (response) => response.items });
}

/** Group detail incl. members. */
export function useGroupDetail(groupId: string | undefined) {
  const options = groupQuery(groupId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== undefined && groupId.length > 0,
  });
}

export function useGroupMembers(groupId: string | undefined) {
  const options = groupMembersQuery(groupId ?? "");
  return useQuery({
    ...options,
    enabled: groupId !== undefined && groupId.length > 0,
    select: (response) => response.items,
  });
}

/**
 * Invite list. The endpoint is admin-only, so pass `enabled: false` for plain members;
 * a 403 is never retried.
 */
export function useGroupInvites(groupId: string | undefined, enabled = true) {
  const options = groupInvitesQuery(groupId ?? "", { limit: 100 });
  return useQuery({
    ...options,
    enabled: enabled && groupId !== undefined && groupId.length > 0,
    retry: false,
    select: (response) => response.items,
  });
}

export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation<GroupWithRole, Error, CreateGroupRequest>({
    mutationFn: async (input) => {
      const response = await createGroup(input);
      return response.group;
    },
    // Creating a group also sets users.active_group_id server-side, so `me` must refetch.
    onSuccess: async () => {
      await Promise.all([invalidate.groups(client), invalidate.me(client)]);
    },
  });
}

export interface UpdateGroupInput extends UpdateGroupRequest {
  groupId: string;
}

export function useUpdateGroup() {
  const client = useQueryClient();
  return useMutation<GroupWithRole, Error, UpdateGroupInput>({
    mutationFn: async ({ groupId, ...patch }) => {
      const response = await updateGroup(groupId, patch);
      return response.group;
    },
    onSuccess: async (group) => {
      await Promise.all([
        invalidate.groups(client),
        client.invalidateQueries({ queryKey: queryKeys.groupDetail(group.id) }),
        invalidate.me(client),
      ]);
    },
  });
}

export function useDeleteGroup() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (groupId) => deleteGroup(groupId),
    onSuccess: async (_result, groupId) => {
      // Everything under this group is gone — drop the whole subtree.
      client.removeQueries({ queryKey: queryKeys.group(groupId) });
      await Promise.all([invalidate.groups(client), invalidate.me(client)]);
    },
  });
}

export interface ChangeRoleInput {
  groupId: string;
  userId: string;
  role: GroupRole;
}

export function useChangeMemberRole() {
  const client = useQueryClient();
  return useMutation<GroupMember, Error, ChangeRoleInput>({
    mutationFn: async ({ groupId, userId, role }) => {
      const response = await updateMemberRole(groupId, userId, { role });
      return response.member;
    },
    onSuccess: async (member) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.groupDetail(member.groupId) }),
        invalidate.members(client, member.groupId),
        invalidate.groups(client),
        invalidate.me(client),
      ]);
    },
  });
}

export interface RemoveMemberInput {
  groupId: string;
  userId: string;
}

/** Also used for "Gruppe verlassen" (a member removing themself). */
export function useRemoveMember() {
  const client = useQueryClient();
  return useMutation<void, Error, RemoveMemberInput>({
    mutationFn: ({ groupId, userId }) => removeGroupMember(groupId, userId),
    onSuccess: async (_result, { groupId }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.groupDetail(groupId) }),
        invalidate.members(client, groupId),
        invalidate.groups(client),
        invalidate.me(client),
      ]);
    },
  });
}

export interface CreateInviteInput extends CreateInviteRequest {
  groupId: string;
}

export function useCreateInvite() {
  const client = useQueryClient();
  return useMutation<GroupInviteResponse, Error, CreateInviteInput>({
    mutationFn: ({ groupId, ...body }) => createGroupInvite(groupId, body),
    onSuccess: async (_result, { groupId }) => {
      await invalidate.invites(client, groupId);
    },
  });
}

export interface RevokeInviteInput {
  groupId: string;
  inviteId: string;
}

export function useRevokeInvite() {
  const client = useQueryClient();
  return useMutation<void, Error, RevokeInviteInput>({
    mutationFn: ({ groupId, inviteId }) => revokeGroupInvite(groupId, inviteId),
    onSuccess: async (_result, { groupId }) => {
      await invalidate.invites(client, groupId);
    },
  });
}

export function useAcceptInvite() {
  const client = useQueryClient();
  return useMutation<AcceptInviteResponse, Error, string>({
    mutationFn: (token) => acceptInvite({ token }),
    onSuccess: async () => {
      await Promise.all([invalidate.groups(client), invalidate.me(client)]);
    },
  });
}

export const INVITE_STATUS_LABELS: Record<string, string> = {
  pending: "Offen",
  accepted: "Angenommen",
  revoked: "Zurückgezogen",
  expired: "Abgelaufen",
};
