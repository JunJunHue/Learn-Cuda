import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

function getDbUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || raw === "undefined") {
    return `file:${path.resolve(process.cwd(), "prisma/dev.db")}`;
  }
  // Convert relative file: URLs to absolute
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    return `file:${path.resolve(process.cwd(), raw.slice("file:".length))}`;
  }
  return raw;
}

function createPrismaClient(): PrismaClient {
  const url = getDbUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter } as never);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
