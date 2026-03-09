import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/auth";
import {
  markProjectProgress,
  markConceptRead,
  getDashboardStats,
  getProgressByCategory,
  updateStreak,
} from "@/lib/progress";

let testUserId: string;
let projectId: string;
let conceptPageId: string;

beforeAll(async () => {
  // Seed a project and concept page for tests
  const proj = await prisma.project.upsert({
    where: { slug: "test-vector-add" },
    update: {},
    create: {
      slug: "test-vector-add",
      title: "Test Vector Add",
      description: "Test project",
      difficulty: "Beginner",
      category: "Memory",
      estimatedMinutes: 30,
      starterCode: "int main() { return 0; }",
    },
  });
  projectId = proj.id;

  const concept = await prisma.conceptPage.upsert({
    where: { slug: "test-thread-hierarchy" },
    update: {},
    create: {
      slug: "test-thread-hierarchy",
      title: "Test Thread Hierarchy",
      category: "Parallelism",
      content: "Test concept content about threads and blocks.",
      order: 1,
    },
  });
  conceptPageId = concept.id;
});

beforeEach(async () => {
  // Clean up user state between tests
  await prisma.userProgress.deleteMany();
  await prisma.userStreak.deleteMany();
  await prisma.user.deleteMany({ where: { email: { startsWith: "progress-test" } } });

  const user = await createUser(
    `progress-test-${Date.now()}@example.com`,
    "password123"
  );
  testUserId = user.id;
});

describe("Feature: User Auth & Progress Tracking", () => {
  describe("markProjectProgress", () => {
    it("creates a 'started' progress record", async () => {
      const result = await markProjectProgress(testUserId, projectId, "started");
      expect(result.status).toBe("started");
      expect(result.userId).toBe(testUserId);
      expect(result.projectId).toBe(projectId);
      expect(result.completedAt).toBeNull();
    });

    it("creates a 'completed' progress record with timestamp", async () => {
      const result = await markProjectProgress(testUserId, projectId, "completed");
      expect(result.status).toBe("completed");
      expect(result.completedAt).toBeTruthy();
    });

    it("upgrades 'started' to 'completed' on second call", async () => {
      await markProjectProgress(testUserId, projectId, "started");
      const result = await markProjectProgress(testUserId, projectId, "completed");
      expect(result.status).toBe("completed");
      expect(result.completedAt).toBeTruthy();
    });

    it("does not duplicate records — only one record per user-project", async () => {
      await markProjectProgress(testUserId, projectId, "started");
      await markProjectProgress(testUserId, projectId, "completed");

      const records = await prisma.userProgress.findMany({
        where: { userId: testUserId, projectId },
      });
      expect(records).toHaveLength(1);
    });
  });

  describe("markConceptRead", () => {
    it("creates a 'read' progress record for a concept page", async () => {
      const result = await markConceptRead(testUserId, conceptPageId);
      expect(result.status).toBe("read");
      expect(result.userId).toBe(testUserId);
      expect(result.conceptPageId).toBe(conceptPageId);
    });

    it("is idempotent — calling twice does not create duplicates", async () => {
      await markConceptRead(testUserId, conceptPageId);
      await markConceptRead(testUserId, conceptPageId);

      const records = await prisma.userProgress.findMany({
        where: { userId: testUserId, conceptPageId },
      });
      expect(records).toHaveLength(1);
    });
  });

  describe("getDashboardStats", () => {
    it("returns zero stats for new user", async () => {
      const stats = await getDashboardStats(testUserId);
      expect(stats.projectsStarted).toBe(0);
      expect(stats.projectsCompleted).toBe(0);
      expect(stats.conceptsRead).toBe(0);
      expect(stats.currentStreak).toBe(0);
    });

    it("reflects project progress correctly", async () => {
      await markProjectProgress(testUserId, projectId, "started");
      const stats = await getDashboardStats(testUserId);
      expect(stats.projectsStarted).toBe(1);
      expect(stats.projectsCompleted).toBe(0);
    });

    it("reflects completed project in stats", async () => {
      await markProjectProgress(testUserId, projectId, "completed");
      const stats = await getDashboardStats(testUserId);
      expect(stats.projectsCompleted).toBe(1);
    });

    it("reflects concept read in stats", async () => {
      await markConceptRead(testUserId, conceptPageId);
      const stats = await getDashboardStats(testUserId);
      expect(stats.conceptsRead).toBe(1);
    });
  });

  describe("getProgressByCategory", () => {
    it("returns category breakdown for user", async () => {
      await markProjectProgress(testUserId, projectId, "completed");
      const categories = await getProgressByCategory(testUserId);

      expect(categories["Memory"]).toBeDefined();
      expect(categories["Memory"].completed).toBe(1);
    });

    it("returns empty object for new user", async () => {
      const categories = await getProgressByCategory(testUserId);
      expect(Object.keys(categories)).toHaveLength(0);
    });
  });

  describe("updateStreak", () => {
    it("starts streak at 1 on first activity", async () => {
      await updateStreak(testUserId);
      const streak = await prisma.userStreak.findUnique({
        where: { userId: testUserId },
      });
      expect(streak?.currentStreak).toBe(1);
      expect(streak?.longestStreak).toBe(1);
    });

    it("does not increment streak for same-day activity", async () => {
      await updateStreak(testUserId);
      await updateStreak(testUserId);
      const streak = await prisma.userStreak.findUnique({
        where: { userId: testUserId },
      });
      expect(streak?.currentStreak).toBe(1);
    });

    it("resets streak after gap of more than 1 day", async () => {
      // Manually set lastActiveAt to 3 days ago
      await prisma.userStreak.update({
        where: { userId: testUserId },
        data: {
          currentStreak: 5,
          longestStreak: 5,
          lastActiveAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });

      await updateStreak(testUserId);
      const streak = await prisma.userStreak.findUnique({
        where: { userId: testUserId },
      });
      expect(streak?.currentStreak).toBe(1); // reset
      expect(streak?.longestStreak).toBe(5); // longest preserved
    });

    it("tracking is triggered automatically on markProjectProgress", async () => {
      await markProjectProgress(testUserId, projectId, "completed");
      const streak = await prisma.userStreak.findUnique({
        where: { userId: testUserId },
      });
      expect(streak?.currentStreak).toBeGreaterThan(0);
    });
  });
});
