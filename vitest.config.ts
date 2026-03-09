import { defineConfig } from "vitest/config";
import path from "path";

const TEST_DB_PATH = path.resolve(__dirname, "prisma/test.db");

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["__tests__/setup.ts"],
    isolate: true,
    // Inject env vars before any module loads
    env: {
      DATABASE_URL: `file:${TEST_DB_PATH}`,
      NODE_ENV: "test",
    },
    coverage: {
      reporter: ["text", "json"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
