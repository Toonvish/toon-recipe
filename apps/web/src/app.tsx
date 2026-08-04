import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { createQueryClient } from "@/lib/query-client";
import { router } from "@/router";

/** One client per app instance (module scope, so HMR keeps the cache). */
const queryClient = createQueryClient();

/**
 * Provider stack:
 *   ErrorBoundary -> QueryClient -> Toasts -> Router (-> SessionProvider in the root route)
 * The session provider deliberately lives inside the router so it can navigate.
 */
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
