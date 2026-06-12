import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * Vite config — perf-tuned chunk splitting.
 *
 * Before manualChunks the production build produced a single ~989 KB
 * JS file because Rollup's default chunker pulls every transitive
 * import into the entry. That tanked Lighthouse perf below 90.
 *
 * After: discrete vendor chunks so the visitor only downloads what
 * their route actually needs:
 *
 *   - vendor-react    React + ReactDOM + React Router (every page)
 *   - vendor-query    TanStack Query + persisters (every page)
 *   - vendor-motion   Framer Motion (every page — landing has hero
 *                     stagger, Shell has nav transitions)
 *   - vendor-charts   Recharts + d3 deps (Apex, Standings, Driver,
 *                     Model — loaded only when a chart route mounts)
 *   - vendor-icons    lucide-react (every page)
 *
 * Each route component is React.lazy() in App.tsx so the per-route
 * code lands in its own chunk separate from vendor.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY || "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Recharts pulls d3-scale / d3-shape / d3-array — co-locate.
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("react-router")) return "vendor-react";
          if (id.includes("/react-dom/") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("/react/")) return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
          return undefined;
        },
      },
    },
  },
});
