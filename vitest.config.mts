import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // Next.js resolves `server-only` via its bundler; Vitest has no such
      // resolver, so point the guard at an empty stub during tests.
      "server-only": new URL("./src/test/server-only-stub.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
