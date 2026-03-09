import { execSync } from "child_process";
import path from "path";

const TEST_DB_PATH = path.resolve(__dirname, "../prisma/test.db");
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.NODE_ENV = "test";

beforeAll(async () => {
  // Apply migrations to the test DB (creates DB if missing, no data loss if present)
  execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DATABASE_URL: `file:${TEST_DB_PATH}`,
    },
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
  });
});
