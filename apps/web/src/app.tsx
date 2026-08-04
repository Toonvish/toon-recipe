import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  createIndexedDbPersister,
  shouldPersistMutation,
  shouldPersistQuery,
} from "@/lib/persist";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";
// Imported for its SIDE EFFECT: it registers the mutation defaults that let a shopping
// list edited offline be replayed. A restored mutation carries its variables but not
// its function, so those defaults must exist before resumePausedMutations() runs.
import "@/features/shopping/lib/offline";

/**
 * ONE stable persister for the whole app lifetime. It resolves the account it writes
 * for on every call (see lib/persist.ts), which is what keeps a login as a different
 * user from saving into the previous user's blob.
 */
const persister = createIndexedDbPersister();

/**
 * Provider stack:
 *   ErrorBoundary -> PersistQueryClient -> Toasts -> Router (-> SessionProvider)
 * The session provider deliberately lives inside the router so it can navigate.
 *
 * `PersistQueryClientProvider` rather than a `persistQueryClient()` call in an
 * effect, because it HOLDS BACK the first fetches until the restore has finished.
 * Without that gate an offline start would fire `/api/auth/me`, fail, and paint
 * "Server nicht erreichbar" a tick before the cached session arrived.
 *
 * `onSuccess` fires once the restore has finished, and is where shopping-list edits
 * queued offline are flushed. It has to be here rather than in a screen: the mutations
 * come out of the same blob the restore just read, and the phone may well be reopened
 * on a completely different route.
 */
export function App() {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE_MS,
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistQuery,
            shouldDehydrateMutation: shouldPersistMutation,
          },
        }}
        onSuccess={() => {
          // A failed replay must not become an unhandled rejection: the mutation stays
          // paused and the next reconnect tries again.
          void queryClient.resumePausedMutations().catch(() => undefined);
        }}
      >
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
