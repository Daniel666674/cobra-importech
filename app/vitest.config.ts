import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/empty.ts"),
    },
  },
  test: { environment: "node", env: { PGLITE_MEMORY: "1" }, testTimeout: 30000, hookTimeout: 60000 },
});
