/**
 * Session + active-group context.
 *
 *  - `useSession()`     — current user, groups, loading/auth flags.
 *  - `useCurrentUser()` — the user, or throws inside guarded routes (never null there).
 *  - `useActiveGroup()` — the group every group-scoped screen works on (persisted in
 *                         localStorage, defaults to the user's `activeGroupId`, then
 *                         the first group).
 *  - `useLogin() / useRegister() / useLogout()` — mutations that keep the cache in sync.
 *  - `<RequireAuth>`    — route guard, redirects to `/login?next=…`.
 *  - `<RequireActiveGroup>` — for screens that need a group (recipes, imports).
 *
 * The provider lives INSIDE the router (root route) so it can navigate on a 401.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import type {
  AuthSessionResponse,
  GroupRole,
  GroupWithRole,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  User,
} from "@toon/shared";
import { roleAtLeast } from "@toon/shared";
import {
  loginWithPassword,
  logout as logoutRequest,
  registerAccount,
  setUnauthorizedHandler,
  updateProfile,
} from "./api";
import { safeNextPath } from "./navigation";
import { purgePersistedCache, setActiveCacheUser } from "./persist";
import { useOnlineStatus } from "./pwa";
import { healthQuery, invalidate, meQuery, queryKeys } from "./queries";
import { readStorage, storageKeys, writeStorage } from "./storage";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FullPageLoader } from "@/components/ui/Spinner";

export interface SessionContextValue {
  user: User | null;
  groups: readonly GroupWithRole[];
  /** True while the bootstrap request is in flight (first load only). */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Bootstrap failure (server down) — a 401 is NOT an error. */
  error: unknown;
  refetch: () => Promise<unknown>;

  /**
   * False while the device reports no connection. Screens use it to disable writes
   * BEFORE they fail (see `useCanMutate`), because offline the app is read-only.
   */
  isOnline: boolean;
  /**
   * True when the user/recipes on screen come from the persisted offline cache and
   * the server could not be reached to confirm them. Cook mode is fine; anything
   * that writes is not.
   */
  isOfflineData: boolean;

  activeGroupId: string | null;
  activeGroup: GroupWithRole | null;
  /** Switches the active group and remembers it on the server + in localStorage. */
  setActiveGroup: (groupId: string) => void;
  /** Role in the active group. */
  role: GroupRole | null;
  /** `hasRole("admin")` — owner satisfies admin. */
  hasRole: (required: GroupRole) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const meResult = useQuery(meQuery());
  const isOnline = useOnlineStatus();

  const me: MeResponse | null = meResult.data ?? null;
  const user = me?.user ?? null;
  const groups = useMemo<readonly GroupWithRole[]>(() => me?.groups ?? [], [me]);

  /**
   * Keep the offline cache pointed at the account on screen.
   *
   * This is the data-leak guard from lib/persist.ts: the id decides which
   * IndexedDB blob is written, and a change purges the store, so a second person on
   * the same phone can never restore the first one's recipes. Runs as an effect (not
   * in render) because it performs I/O.
   */
  useEffect(() => {
    if (user) setActiveCacheUser(user.id);
  }, [user]);

  /**
   * `data` from the persisted cache plus a failed refetch = we are showing what the
   * device already had. That is the honest signal for "read-only right now" — a
   * plain `navigator.onLine === false` also covers the captive-wifi case where the
   * browser thinks it is online and every request still fails.
   */
  const isOfflineData = user !== null && (!isOnline || meResult.isError);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    readStorage(storageKeys.activeGroupId),
  );

  /** Server-side "remember my active group"; failures are non-fatal. */
  const rememberGroup = useMutation({
    mutationFn: (groupId: string) => updateProfile({ activeGroupId: groupId }),
    onSuccess: () => {
      void invalidate.me(queryClient);
    },
  });

  const activeGroupId = useMemo(() => {
    if (groups.length === 0) return null;
    const candidates = [selectedGroupId, user?.activeGroupId ?? null];
    for (const candidate of candidates) {
      if (candidate && groups.some((group) => group.id === candidate)) return candidate;
    }
    return groups[0]?.id ?? null;
  }, [groups, selectedGroupId, user?.activeGroupId]);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [groups, activeGroupId],
  );

  // Keep localStorage in sync with the effective group (also after joining a group).
  useEffect(() => {
    if (activeGroupId && activeGroupId !== readStorage(storageKeys.activeGroupId)) {
      writeStorage(storageKeys.activeGroupId, activeGroupId);
    }
  }, [activeGroupId]);

  const setActiveGroup = useCallback(
    (groupId: string) => {
      setSelectedGroupId(groupId);
      writeStorage(storageKeys.activeGroupId, groupId);
      rememberGroup.mutate(groupId);
    },
    [rememberGroup],
  );

  // A 401 from any endpoint sends the user to the login screen (client-side).
  useEffect(() => {
    setUnauthorizedHandler((next) => {
      queryClient.setQueryData(queryKeys.me(), null);
      void navigate({ to: "/login", search: { next }, replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, queryClient]);

  const role = activeGroup?.role ?? null;

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      groups,
      isLoading: meResult.isPending,
      isAuthenticated: user !== null,
      error: meResult.error,
      refetch: () => meResult.refetch(),
      isOnline,
      isOfflineData,
      activeGroupId,
      activeGroup,
      setActiveGroup,
      role,
      hasRole: (required: GroupRole) => (role ? roleAtLeast(role, required) : false),
    }),
    [
      user,
      groups,
      meResult.isPending,
      meResult.error,
      meResult.refetch,
      isOnline,
      isOfflineData,
      activeGroupId,
      activeGroup,
      setActiveGroup,
      role,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}

/** Inside `<RequireAuth>` the user is guaranteed — use this to avoid null checks. */
export function useCurrentUser(): User {
  const { user } = useSession();
  if (!user) throw new Error("useCurrentUser may only be used inside a protected route.");
  return user;
}

export interface ActiveGroupValue {
  /** Null only when the user is in no group at all. */
  groupId: string | null;
  group: GroupWithRole | null;
  groups: readonly GroupWithRole[];
  setActiveGroup: (groupId: string) => void;
  role: GroupRole | null;
  hasRole: (required: GroupRole) => boolean;
}

export function useActiveGroup(): ActiveGroupValue {
  const { activeGroupId, activeGroup, groups, setActiveGroup, role, hasRole } = useSession();
  return { groupId: activeGroupId, group: activeGroup, groups, setActiveGroup, role, hasRole };
}

/**
 * Same as {@link useActiveGroup} but the id is non-null — only valid below
 * `<RequireActiveGroup>`, which is exactly where recipe/import screens live.
 */
export function useRequiredGroupId(): string {
  const { activeGroupId } = useSession();
  if (!activeGroupId) {
    throw new Error("No active group — <RequireActiveGroup> is missing around this route.");
  }
  return activeGroupId;
}

/**
 * Whether an unconfirmed e-mail address is what is stopping this account writing.
 *
 * TWO conditions, and both are needed. The server only enforces the gate when it
 * can actually send a confirmation link (`features.verifiedEmailRequired` on
 * `/api/health`, see the API's services/auth/verifiedEmail.ts), and the account
 * only fails it while `emailVerifiedAt` is null. Reading just the second would
 * grey out every write on the default self-hosted stack, where no mail transport
 * is configured and nothing is gated at all.
 *
 * UNKNOWN COUNTS AS "NOT REQUIRED" — the opposite bias from
 * `useOcrImportAvailable`, on purpose. While the health probe is in flight, or
 * against a server predating the field, guessing "gated" would disable the whole
 * app and demand a confirmation that server never asks for; guessing "open" costs
 * at worst one 403 that {@link useCanMutate}'s copy already explains. The server
 * is the enforcement either way.
 *
 * THE TIMESTAMP, NOT THE FLAG. `emailVerified` was true for every account before
 * the confirmation flow existed; `emailVerifiedAt` is the only evidence, exactly
 * as on the server.
 */
export function useEmailVerificationBlock(): string | undefined {
  const { user } = useSession();
  const { data } = useQuery(healthQuery());
  const t = useT();

  if (data?.features?.verifiedEmailRequired !== true) return undefined;
  if (user === null) return undefined;
  if (user.emailVerifiedAt != null) return undefined;
  return t("ui.session.emailUnverifiedBlocked");
}

/**
 * Whether the app may write right now.
 *
 * Two independent reasons it may not, and the ORDER matters: an unconfirmed
 * address is reported first because it is the one the user can actually do
 * something about, and it does not go away by walking towards the router.
 *
 * Offline support here is READ-ONLY on purpose: there is no conflict story for two
 * flatmates editing one recipe, so a "saved" that silently evaporates would be
 * worse than a disabled button. Screens use this to disable editors, the import
 * flow and every destructive action BEFORE the request fails, and to render
 * `reason` next to them.
 *
 * DO NOT USE THIS ON THE SHOPPING SCREENS. The shopping list is the one feature
 * that IS editable offline — its writes go through a persisted mutation outbox
 * (features/shopping/lib/offline.ts) and replay on reconnect — so `canMutate:
 * false` there is exactly backwards. Those screens gate only list
 * create/rename/delete on `isOnline`, and take the verification half of this
 * answer from {@link useEmailVerificationBlock} directly: a write the server will
 * refuse with 403 must not enter the outbox, because a queued mutation that can
 * never succeed just fails loudly on every reconnect.
 *
 * ```tsx
 * const { canMutate, reason } = useCanMutate();
 * <Button disabled={!canMutate} title={reason}>Save</Button>
 * ```
 */
export function useCanMutate(): { canMutate: boolean; reason: string | undefined } {
  const { isOnline } = useSession();
  const unverified = useEmailVerificationBlock();
  const t = useT();

  if (unverified !== undefined) return { canMutate: false, reason: unverified };
  return isOnline
    ? { canMutate: true, reason: undefined }
    : {
        canMutate: false,
        reason: t("ui.session.offlineSaveBlocked"),
      };
}

/* -------------------------------------------------------------------------- */
/* auth mutations                                                             */
/* -------------------------------------------------------------------------- */

function useAuthSuccessHandler() {
  const queryClient = useQueryClient();
  return useCallback(
    (data: AuthSessionResponse) => {
      queryClient.setQueryData(queryKeys.me(), data);
      const groupId = data.activeGroupId ?? data.groups[0]?.id ?? null;
      if (groupId) writeStorage(storageKeys.activeGroupId, groupId);
      void invalidate.groups(queryClient);
    },
    [queryClient],
  );
}

export function useLogin() {
  const onAuthenticated = useAuthSuccessHandler();
  return useMutation<AuthSessionResponse, unknown, LoginRequest>({
    mutationFn: (body) => loginWithPassword(body),
    onSuccess: onAuthenticated,
  });
}

export function useRegister() {
  const onAuthenticated = useAuthSuccessHandler();
  return useMutation<AuthSessionResponse, unknown, RegisterRequest>({
    mutationFn: (body) => registerAccount(body),
    onSuccess: onAuthenticated,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation<void, unknown, void>({
    mutationFn: () => logoutRequest(),
    // `onSettled`, not `onSuccess`: if the logout request itself fails (offline,
    // server down) the local state must still be gone. Leaving a persisted cache
    // behind on a phone whose owner just tapped "Abmelden" is the exact failure this
    // feature must not introduce.
    onSettled: async () => {
      writeStorage(storageKeys.activeGroupId, null);
      queryClient.setQueryData(queryKeys.me(), null);
      queryClient.clear();
      // Drops the IndexedDB blob AND the lastUserId pointer, so the next start has
      // nothing to restore and no id to restore it under.
      setActiveCacheUser(null);
      await purgePersistedCache();
      await navigate({ to: "/login", replace: true });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* guards                                                                     */
/* -------------------------------------------------------------------------- */

/** Redirects to `/login?next=<current url>` when there is no session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, error, refetch } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const redirecting = useRef(false);
  const t = useT();

  /**
   * AT MOST ONE REDIRECT PER MOUNT — the ref is the whole point.
   *
   * `useLocation()` reads `router.stores.location`, which flips to the new URL the
   * moment `navigate()` touches history, while THIS tree is still rendered (matches
   * only swap once the target route has loaded). So an effect keyed on
   * `location.href` fires again with `/login?next=%2F` already in hand and folds it
   * into the next redirect — `/login?next=%2Flogin%3Fnext%3D…`, growing on every
   * pass until the app is wedged on a multi-kilobyte URL.
   *
   * `safeNextPath` is the second, independent stop: it rejects any target that
   * itself starts with `/login`, so the parameter can never nest even once.
   */
  useEffect(() => {
    if (isLoading || error) return;
    if (isAuthenticated) {
      redirecting.current = false;
      return;
    }
    if (redirecting.current) return;
    redirecting.current = true;
    const next = safeNextPath(location.href);
    void navigate({ to: "/login", search: next === "/" ? {} : { next }, replace: true });
  }, [isLoading, isAuthenticated, error, navigate, location.href]);

  if (isLoading) return <FullPageLoader label={t("ui.session.checkingLogin")} />;

  // A RESTORED SESSION WINS OVER A FAILED REFETCH. This is what makes the installed
  // app usable in airplane mode: `/api/auth/me` cannot be reached, but the persisted
  // bootstrap payload is there, so the app renders and cook mode works on recipes
  // that were opened before. The banner and the disabled editors say the rest.
  //
  // It is not a way in: the cookie is still the only thing the API accepts, and a
  // 401 once there IS a connection clears the cache and redirects (lib/api.ts).
  if (isAuthenticated) return <>{children}</>;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <ErrorState
          error={error}
          title={t("ui.session.serverUnreachable")}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  return <FullPageLoader label={t("ui.session.redirectingToLogin")} />;
}

/** For group-scoped screens: shows an onboarding card when the user has no group. */
export function RequireActiveGroup({ children }: { children: ReactNode }) {
  const { groups, activeGroupId } = useSession();
  const navigate = useNavigate();
  const t = useT();

  if (groups.length === 0 || !activeGroupId) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <EmptyState
          icon={<Users />}
          title={t("ui.session.noGroupTitle")}
          description={t("ui.session.noGroupDescription")}
          action={
            <Button
              fullWidth
              onClick={() => {
                void navigate({ to: "/groups" });
              }}
            >
              {t("ui.session.createGroup")}
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
