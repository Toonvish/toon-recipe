/**
 * Groups feature barrel (GroupSwitcher.tsx is owned by the shell agent).
 *
 * The route screens are NOT re-exported here. `router.tsx` loads them with
 * `lazyRouteComponent(() => import(...))`; a static re-export that anything imports
 * would pull them into the main chunk and break the code splitting.
 */
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
