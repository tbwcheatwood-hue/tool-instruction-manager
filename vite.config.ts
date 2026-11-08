import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The PHP studio lives in autonomous/ and has its own HTML. Vite must not
  // treat those files as this app, or the lab page is replaced by a resolve error.
  optimizeDeps: {
    entries: ["index.html"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/autonomous/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
