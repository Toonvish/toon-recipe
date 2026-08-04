/** Groups feature barrel (GroupSwitcher.tsx is owned by the shell agent). */
export { default as GroupsPage } from "./GroupsPage";
export { default as GroupDetailPage } from "./GroupDetailPage";
export { MemberList, type MemberListProps } from "./components/MemberList";
export { InvitePanel, type InvitePanelProps } from "./components/InvitePanel";
export {
  useGroups,
  useGroupDetail,
  useGroupMembers,
  useGroupInvites,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useChangeMemberRole,
  useRemoveMember,
  useCreateInvite,
  useRevokeInvite,
  useAcceptInvite,
  INVITE_STATUS_LABELS,
} from "./lib/queries";
