/**
 * Code-based TanStack Router tree.
 *
 * Route map (all German-facing paths):
 *   public   /login  /register  /oauth/callback  /invite/$token
 *   guarded  /  /search  /recipes/new  /recipes/$recipeId  /recipes/$recipeId/edit
 *            /import  /import/$draftId  /collections  /collections/$collectionId  /tags
 *            /groups  /groups/$groupId  /settings
 *
 * Screens owned by other agents are resolved lazily through `lazyPage` (see
 * lib/lazy-page.tsx) — the file paths below are the contract. Export the screen as
 * the module's DEFAULT export (a named export from the list also works).
 */
import type { ReactElement } from "react";
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { NotFoundPage } from "@/components/layout/NotFoundPage";
import { lazyPage } from "@/lib/lazy-page";
import { RequireActiveGroup, RequireAuth, SessionProvider } from "@/lib/session";
import { InvitePage } from "@/features/auth/InvitePage";
import { LoginPage } from "@/features/auth/LoginPage";
import { OAuthCallbackPage } from "@/features/auth/OAuthCallbackPage";
import { RegisterPage } from "@/features/auth/RegisterPage";

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
 * Filter/search params of the recipe list AND the search screen. Both routes must
 * declare the same keys, because `useUrlRecipeFilters` (features/recipes/lib/
 * url-filters.ts) is the single owner of that state and `pick()` drops anything
 * that is not listed here.
 */
const RECIPE_FILTER_PARAMS = [
  "q",
  "tags",
  "collectionId",
  "maxMinutes",
  "difficulty",
  "sort",
] as const;

/** Wraps a screen that needs an active group (recipes, imports). */
function groupScoped(Component: () => ReactElement): () => ReactElement {
  return function GroupScopedRoute() {
    return (
      <RequireActiveGroup>
        <Component />
      </RequireActiveGroup>
    );
  };
}

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
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next", "error"]),
  component: LoginPage,
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

const recipeListRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => pick(search, RECIPE_FILTER_PARAMS),
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/recipes/RecipeListPage.tsx",
        "/src/features/recipes/RecipesPage.tsx",
        "/src/features/recipes/pages/RecipeListPage.tsx",
      ],
      exportNames: ["RecipeListPage", "RecipesPage"],
      title: "Rezeptliste kommt gleich",
      description: "Die Rezeptübersicht wird von einem anderen Modul geliefert.",
    }),
  ),
});

const searchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/search",
  // Same set as "/" so the shared filter hook can rewrite either URL in place.
  validateSearch: (search: Record<string, unknown>) => pick(search, RECIPE_FILTER_PARAMS),
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/recipes/SearchPage.tsx",
        "/src/features/recipes/RecipeSearchPage.tsx",
        "/src/features/recipes/RecipeListPage.tsx",
      ],
      exportNames: ["SearchPage", "RecipeSearchPage", "RecipeListPage"],
      title: "Suche kommt gleich",
      description: "Die Suchansicht wird von einem anderen Modul geliefert.",
    }),
  ),
});

const recipeNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/recipes/new",
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/recipes/RecipeNewPage.tsx",
        "/src/features/recipes/RecipeCreatePage.tsx",
        "/src/features/recipes/RecipeFormPage.tsx",
      ],
      exportNames: ["RecipeNewPage", "RecipeCreatePage", "RecipeFormPage"],
      title: "Rezept anlegen kommt gleich",
    }),
  ),
});

const recipeDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/recipes/$recipeId",
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/recipes/RecipeDetailPage.tsx",
        "/src/features/recipes/RecipePage.tsx",
      ],
      exportNames: ["RecipeDetailPage", "RecipePage"],
      title: "Rezeptansicht kommt gleich",
    }),
  ),
});

const recipeEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/recipes/$recipeId/edit",
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/recipes/RecipeEditPage.tsx",
        "/src/features/recipes/RecipeFormPage.tsx",
      ],
      exportNames: ["RecipeEditPage", "RecipeFormPage"],
      title: "Rezept bearbeiten kommt gleich",
    }),
  ),
});

const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/import",
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/import/ImportPage.tsx",
        "/src/features/imports/ImportPage.tsx",
        "/src/features/import/ImportStartPage.tsx",
      ],
      exportNames: ["ImportPage", "ImportStartPage"],
      title: "Import kommt gleich",
      description: "URL-, Foto- und PDF-Import werden von einem anderen Modul geliefert.",
    }),
  ),
});

const importReviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/import/$draftId",
  component: groupScoped(
    lazyPage({
      candidates: [
        "/src/features/import/ImportReviewPage.tsx",
        "/src/features/imports/ImportReviewPage.tsx",
        "/src/features/import/DraftReviewPage.tsx",
      ],
      exportNames: ["ImportReviewPage", "DraftReviewPage"],
      title: "Entwurf prüfen kommt gleich",
    }),
  ),
});

const collectionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections",
  component: groupScoped(
    lazyPage({
      candidates: ["/src/features/collections/CollectionsPage.tsx"],
      exportNames: ["CollectionsPage"],
      title: "Sammlungen kommen gleich",
    }),
  ),
});

const collectionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections/$collectionId",
  component: groupScoped(
    lazyPage({
      candidates: ["/src/features/collections/CollectionDetailPage.tsx"],
      exportNames: ["CollectionDetailPage"],
      title: "Sammlung kommt gleich",
    }),
  ),
});

const tagsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/tags",
  component: groupScoped(
    lazyPage({
      candidates: ["/src/features/tags/TagsPage.tsx"],
      exportNames: ["TagsPage"],
      title: "Tags kommen gleich",
    }),
  ),
});

const groupsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/groups",
  component: lazyPage({
    candidates: ["/src/features/groups/GroupsPage.tsx", "/src/features/groups/GroupListPage.tsx"],
    exportNames: ["GroupsPage", "GroupListPage"],
    title: "Gruppenverwaltung kommt gleich",
    description: "Gruppen anlegen, Mitglieder und Einladungen verwalten.",
  }),
});

const groupDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/groups/$groupId",
  component: lazyPage({
    candidates: [
      "/src/features/groups/GroupDetailPage.tsx",
      "/src/features/groups/GroupPage.tsx",
    ],
    exportNames: ["GroupDetailPage", "GroupPage"],
    title: "Gruppendetails kommen gleich",
  }),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  // `?linked=google` / `?error=…` come back from the OAuth link round-trip.
  validateSearch: (search: Record<string, unknown>) => pick(search, ["linked", "error"]),
  component: lazyPage({
    candidates: [
      "/src/features/settings/SettingsPage.tsx",
      "/src/features/auth/AccountSettingsPage.tsx",
    ],
    exportNames: ["SettingsPage", "AccountSettingsPage"],
    title: "Einstellungen kommen gleich",
  }),
});

/* -------------------------------------------------------------------------- */
/* tree + router                                                              */
/* -------------------------------------------------------------------------- */

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  oauthCallbackRoute,
  inviteRoute,
  appRoute.addChildren([
    recipeListRoute,
    searchRoute,
    recipeNewRoute,
    recipeDetailRoute,
    recipeEditRoute,
    importRoute,
    importReviewRoute,
    collectionsRoute,
    collectionDetailRoute,
    tagsRoute,
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
  scrollRestoration: true,
});

export const routes = {
  root: rootRoute,
  login: loginRoute,
  register: registerRoute,
  oauthCallback: oauthCallbackRoute,
  invite: inviteRoute,
  app: appRoute,
  recipeList: recipeListRoute,
  search: searchRoute,
  recipeNew: recipeNewRoute,
  recipeDetail: recipeDetailRoute,
  recipeEdit: recipeEditRoute,
  import: importRoute,
  importReview: importReviewRoute,
  collections: collectionsRoute,
  collectionDetail: collectionDetailRoute,
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
