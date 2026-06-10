import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { Toaster } from "sonner";

import App from "./App";
import "./styles/globals.css";

/**
 * QueryClient defaults tuned for perceived speed:
 *   - staleTime 5 min     → most pages don't refetch within a typical session
 *   - gcTime 30 min       → cached data stays warm even if you navigate away
 *   - refetchOnMount false → re-entering a route uses cached data instantly
 *   - placeholderData keepPreviousData → season/round switches no longer flash skeletons
 */
const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount:       false,
      refetchOnReconnect:   false,
      staleTime:            5 * 60_000,
      gcTime:               30 * 60_000,
      retry:                1,
      placeholderData:      keepPreviousData,
    },
  },
});

/**
 * Persist the cache to localStorage so a hard reload reuses yesterday's data
 * (no skeleton flash on cold page loads). Cache invalidates after 24 h.
 */
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key:     "f1ml-query-cache",
  throttleTime: 1000,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider
        client={qc}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60 * 1000,   // 1 day
          buster: "v4-schedule-sprint",   // bump this string to invalidate all caches
        }}
      >
        {/* LazyMotion: load animation features once (domAnimation, ~25KB
            instead of the full motion runtime's ~55KB). Combined with the
            `m` component everywhere, this saves ~30KB on initial bundle.
            MotionConfig with reducedMotion="user" lives inside so the
            preference still applies globally. */}
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            <App />
            <Toaster theme="dark" position="top-right" richColors />
          </MotionConfig>
        </LazyMotion>
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
