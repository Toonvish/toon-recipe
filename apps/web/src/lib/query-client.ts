import { QueryClient } from "@tanstack/react-query";
import { STALE_TIME, retryDelay, shouldRetry } from "./queries";

/**
 * The single QueryClient for the app. Defaults are tuned for a mobile PWA:
 * no refetch storms on focus, but stale data is refreshed when the phone
 * comes back online or a screen is remounted.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME.list,
        gcTime: 10 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
