import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The hub (server/app.py) serves the build under /app/. Output goes to ../web/dist so
// `python3 server/app.py` needs no Node at demo time.
export default defineConfig({
  base: "/app/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../web/dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // keep three.js in its own chunk so the UI shell paints before the 3D engine parses
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/three/") || id.includes("postprocessing")) return "three";
          if (id.includes("@react-three")) return "r3f";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    // dev: talk to a running hub on :8500
    proxy: { "/ws": { target: "ws://localhost:8500", ws: true }, "/api": "http://localhost:8500" },
  },
});
