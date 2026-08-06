/**
 * Code-based TanStack Router tree.
 *
 * Route map (all German-facing paths):
 *   public   /login  /register  /oauth/callback  /invite/$token
 *            /forgot-password  /reset-password/$token  /verify-email/$token
 *   guarded  /  /recipes/new  /recipes/$recipeId  /recipes/$recipeId/edit
 *            /import  /import/$draftId  /collections  /collections/$collectionId  /tags
 *            /shopping  /shopping/$listId
 *            /groups  /groups/$groupId  /settings
 *   redirect /search -> / (search lives in the recipe list; old links keep working)
 *
 * SCREENS ARE CODE-SPLIT WITH `lazyRouteComponent`, not a bare `React.lazy`, and the
 * difference is not cosmetic. The router preloads a route's component by calling
 * `route.options.component.preload()` (router-core `preloadComponent`), which is the
 * property `lazyRouteComponent` attaches and a plain wrapper component does not have —
 * so a hand-rolled lazy wrapper silently turns `defaultPreload: "intent"` below into a
 * no-op. It also gives us the one-shot reload on a missing module chunk, which is the
 * exact failure a service-worker deploy produces when an old document asks for an
 * `assets/Page-<hash>.js` the new precache no longer has.
 *
 * Export every screen as its module's DEFAULT export.
 */
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { NotFoundPage } from "@/components/layout/NotFoundPage";
import { LoadingBlock } from "@/components/ui/Spinner";
import { RequireActiveGroup, RequireAuth, SessionProvider } from "@/lib/session";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { InvitePage } from "@/features/auth/InvitePage";
import { LoginPage } from "@/features/auth/LoginPage";
import { OAuthCallbackPage } from "@/features/auth/OAuthCallbackPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Search-param validators return objects with OPTIONAL keys only, so `<Link to="/">`
 * never has to pass a `search` prop.
 */
function pick<Keys extends string>(
  search: Record<string, unknown>,
  keys: readonly Keys[],
): Partial<Record<Keys, string>> {
  const result: Partial<Record<Keys, string>> = {};
  for (const key of keys) {
    const value = optionalString(search[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/**
 * Filter/search params of the recipe list. `useUrlRecipeFilters`
 * (features/recipes/lib/url-filters.ts) is the single owner of that state, and `pick()`
 * drops anything not listed here — so a new filter needs a line in this array.
 *
 * `/search` declares the SAME keys even though it only redirects: `validateSearch` runs
 * first, so anything missing here would be stripped before the redirect forwards it.
 */
const RECIPE_FILTER_PARAMS = [
  "q",
  "tags",
  "collectionId",
  "maxMinutes",
  "difficulty",
  "sort",
] as const;

/* -------------------------------------------------------------------------- */
/* root                                                                       */
/* -------------------------------------------------------------------------- */

function RootLayout() {
  // SessionProvider lives inside the router so a 401 can navigate client-side.
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

/* -------------------------------------------------------------------------- */
/* public routes                                                              */
/* -------------------------------------------------------------------------- */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  // `reset=1` comes back from a completed password reset ("bitte neu anmelden").
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next", "error", "reset"]),
  component: LoginPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});

/**
 * The token sits in the PATH, not in a query param: `?token=` values end up in
 * `Referer` headers and in hono's request log (`c.req.path` is logged too, but a
 * path segment at least does not travel to third-party assets the page loads).
 */
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password/$token",
  component: ResetPasswordPage,
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email/$token",
  component: VerifyEmailPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next", "invite"]),
  component: RegisterPage,
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next", "error"]),
  component: OAuthCallbackPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: InvitePage,
});

/* -------------------------------------------------------------------------- */
/* guarded app shell                                                          */
/* -------------------------------------------------------------------------- */

function AppLayout() {
  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}

/** Pathless layout route: everything below it requires a session. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
});

/**
 * Second pathless layout route: everything below it additionally needs an ACTIVE
 * GROUP (recipes, imports, collections, tags, shopping — the group owns the content).
 *
 * The guard is a layout route rather than a wrapper around each screen because a
 * wrapper is a different component than the lazy one, and `.preload` lives on the
 * lazy component — wrapping it hides that property from the router and kills
 * preloading. `/groups`, `/groups/$groupId` and `/settings` stay outside: they are
 * how a user WITH no group gets one, so guarding them would deadlock.
 */
const groupScopedRoute = createRoute({
  getParentRoute: () => appRoute,
  id: "group-scoped",
  component: function GroupScopedLayout() {
    return (
      <RequireActiveGroup>
        <Outlet />
      </RequireActiveGroup>
    );
  },
});

const recipeListRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => pick(search, RECIPE_FILTER_PARAMS),
  component: lazyRouteComponent(() => import("@/features/recipes/RecipeListPage")),
});

/**
 * `/search` is now a REDIRECT to `/`, not a screen.
 *
 * Searching moved into the recipe list (always-visible field + "Erweiterte Suche"
 * panel), so a second screen that also listed recipes had no reason to exist. The route
 * stays because `/search?q=…&tags=…` links were shareable and bookmarkable and must keep
 * working — it still declares `RECIPE_FILTER_PARAMS`, because `validateSearch` runs
 * BEFORE the redirect and `pick()` would otherwise drop the very params being forwarded.
 */
const searchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/search",
  validateSearch: (search: Record<string, unknown>) => pick(search, RECIPE_FILTER_PARAMS),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search, replace: true });
  },
});

const recipeNewRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/recipes/new",
  component: lazyRouteComponent(() => import("@/features/recipes/RecipeNewPage")),
});

const recipeDetailRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/recipes/$recipeId",
  component: lazyRouteComponent(() => import("@/features/recipes/RecipeDetailPage")),
});

const recipeEditRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/recipes/$recipeId/edit",
  component: lazyRouteComponent(() => import("@/features/recipes/RecipeEditPage")),
});

const importRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/import",
  component: lazyRouteComponent(() => import("@/features/import/ImportPage")),
});

const importReviewRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/import/$draftId",
  component: lazyRouteComponent(() => import("@/features/import/ImportReviewPage")),
});

const collectionsRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/collections",
  component: lazyRouteComponent(() => import("@/features/collections/CollectionsPage")),
});

const collectionDetailRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/collections/$collectionId",
  component: lazyRouteComponent(() => import("@/features/collections/CollectionDetailPage")),
});

/**
 * Shopping lists. `/shopping/$listId` is the screen used IN a supermarket, so it is
 * group-scoped like the recipe screens and its data is persisted for offline use
 * (see lib/persist.ts).
 */
const shoppingRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/shopping",
  component: lazyRouteComponent(() => import("@/features/shopping/ShoppingListsPage")),
});

const shoppingListRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/shopping/$listId",
  component: lazyRouteComponent(() => import("@/features/shopping/ShoppingListDetailPage")),
});

const tagsRoute = createRoute({
  getParentRoute: () => groupScopedRoute,
  path: "/tags",
  component: lazyRouteComponent(() => import("@/features/tags/TagsPage")),
});

const groupsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/groups",
  component: lazyRouteComponent(() => import("@/features/groups/GroupsPage")),
});

const groupDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/groups/$groupId",
  component: lazyRouteComponent(() => import("@/features/groups/GroupDetailPage")),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  // `?linked=google` / `?error=…` come back from the OAuth link round-trip.
  validateSearch: (search: Record<string, unknown>) => pick(search, ["linked", "error"]),
  component: lazyRouteComponent(() => import("@/features/auth/AccountSettingsPage")),
});

/* -------------------------------------------------------------------------- */
/* tree + router                                                              */
/* -------------------------------------------------------------------------- */

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  verifyEmailRoute,
  oauthCallbackRoute,
  inviteRoute,
  appRoute.addChildren([
    // Needs an active group.
    groupScopedRoute.addChildren([
      recipeListRoute,
      recipeNewRoute,
      recipeDetailRoute,
      recipeEditRoute,
      importRoute,
      importReviewRoute,
      collectionsRoute,
      collectionDetailRoute,
      shoppingRoute,
      shoppingListRoute,
      tagsRoute,
    ]),
    // Session only — these are how a user without a group gets one.
    searchRoute,
    groupsRoute,
    groupDetailRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadDelay: 80,
  defaultNotFoundComponent: NotFoundPage,
  // Also what puts the Suspense boundary around a match (react-router's `Match`
  // only wraps when a pending element exists), so a lazy chunk has something to
  // fall back to on a cold load, not just during an intent-preloaded navigation.
  defaultPendingComponent: LoadingBlock,
  scrollRestoration: true,
});

export const routes = {
  root: rootRoute,
  login: loginRoute,
  register: registerRoute,
  forgotPassword: forgotPasswordRoute,
  resetPassword: resetPasswordRoute,
  verifyEmail: verifyEmailRoute,
  oauthCallback: oauthCallbackRoute,
  invite: inviteRoute,
  app: appRoute,
  groupScoped: groupScopedRoute,
  recipeList: recipeListRoute,
  search: searchRoute,
  recipeNew: recipeNewRoute,
  recipeDetail: recipeDetailRoute,
  recipeEdit: recipeEditRoute,
  import: importRoute,
  importReview: importReviewRoute,
  collections: collectionsRoute,
  collectionDetail: collectionDetailRoute,
  shopping: shoppingRoute,
  shoppingList: shoppingListRoute,
  tags: tagsRoute,
  groups: groupsRoute,
  groupDetail: groupDetailRoute,
  settings: settingsRoute,
} as const;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
