import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    env: {
      DATA_DIR: path.resolve(import.meta.dirname, ".data/test"),
      DISPATCH_SECRET: "test-secret-test-secret-test-secret-1234",
    },
  },
})
