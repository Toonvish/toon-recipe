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
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
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
import { invalidate, meQuery, queryKeys } from "./queries";
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

  const me: MeResponse | null = meResult.data ?? null;
  const user = me?.user ?? null;
  const groups = useMemo<readonly GroupWithRole[]>(() => me?.groups ?? [], [me]);

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
    throw new Error("useSession muss innerhalb von <SessionProvider> verwendet werden.");
  }
  return context;
}

/** Inside `<RequireAuth>` the user is guaranteed — use this to avoid null checks. */
export function useCurrentUser(): User {
  const { user } = useSession();
  if (!user) throw new Error("useCurrentUser darf nur in geschützten Routen verwendet werden.");
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
    throw new Error("Keine aktive Gruppe — <RequireActiveGroup> fehlt um diese Route.");
  }
  return activeGroupId;
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
    onSettled: async () => {
      writeStorage(storageKeys.activeGroupId, null);
      queryClient.setQueryData(queryKeys.me(), null);
      queryClient.clear();
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void navigate({ to: "/login", search: { next: location.href }, replace: true });
    }
  }, [isLoading, isAuthenticated, error, navigate, location.href]);

  if (isLoading) return <FullPageLoader label="Anmeldung wird geprüft …" />;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <ErrorState
          error={error}
          title="Server nicht erreichbar"
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  if (!isAuthenticated) return <FullPageLoader label="Weiterleitung zur Anmeldung …" />;

  return <>{children}</>;
}

/** For group-scoped screens: shows an onboarding card when the user has no group. */
export function RequireActiveGroup({ children }: { children: ReactNode }) {
  const { groups, activeGroupId } = useSession();
  const navigate = useNavigate();

  if (groups.length === 0 || !activeGroupId) {
    return (
      <div className="mx-auto w-full max-w-md p-4">
        <EmptyState
          icon={<Users />}
          title="Noch keine Gruppe"
          description="Rezepte gehören immer zu einer Gruppe. Lege eine Gruppe an (z. B. „Familie“) oder nimm eine Einladung an."
          action={
            <Button
              fullWidth
              onClick={() => {
                void navigate({ to: "/groups" });
              }}
            >
              Gruppe anlegen
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
