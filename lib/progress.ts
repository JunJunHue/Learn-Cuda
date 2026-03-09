import { prisma } from "./prisma";

export type ProgressStatus = "started" | "completed" | "read";

export async function getUserProgress(userId: string) {
  const progress = await prisma.userProgress.findMany({
    where: { userId },
    include: { project: true, conceptPage: true },
  });

  const streak = await prisma.userStreak.findUnique({ where: { userId } });

  return { progress, streak };
}

export async function markProjectProgress(
  userId: string,
  projectId: string,
  status: "started" | "completed"
) {
  const existing = await prisma.userProgress.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  if (existing) {
    return prisma.userProgress.update({
      where: { id: existing.id },
      data: {
        status,
        completedAt: status === "completed" ? new Date() : existing.completedAt,
      },
    });
  }

  const result = await prisma.userProgress.create({
    data: {
      userId,
      projectId,
      status,
      completedAt: status === "completed" ? new Date() : null,
    },
  });

  await updateStreak(userId);
  return result;
}

export async function markConceptRead(userId: string, conceptPageId: string) {
  const existing = await prisma.userProgress.findUnique({
    where: { userId_conceptPageId: { userId, conceptPageId } },
  });

  if (existing) return existing;

  const result = await prisma.userProgress.create({
    data: { userId, conceptPageId, status: "read" },
  });

  await updateStreak(userId);
  return result;
}

export async function getProgressByCategory(userId: string) {
  const allProgress = await prisma.userProgress.findMany({
    where: { userId, projectId: { not: null } },
    include: { project: true },
  });

  const categories: Record<
    string,
    { total: number; started: number; completed: number }
  > = {};

  for (const p of allProgress) {
    if (!p.project) continue;
    const cat = p.project.category;
    if (!categories[cat]) categories[cat] = { total: 0, started: 0, completed: 0 };
    categories[cat].total++;
    if (p.status === "started") categories[cat].started++;
    if (p.status === "completed") categories[cat].completed++;
  }

  return categories;
}

export async function updateStreak(userId: string) {
  const streak = await prisma.userStreak.findUnique({ where: { userId } });
  if (!streak) return;

  const now = new Date();
  const lastActive = streak.lastActiveAt;

  let newCurrentStreak = streak.currentStreak;

  if (!lastActive) {
    newCurrentStreak = 1;
  } else {
    const diffMs = now.getTime() - lastActive.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Same day, no change
    } else if (diffDays === 1) {
      // Consecutive day
      newCurrentStreak = streak.currentStreak + 1;
    } else {
      // Streak broken
      newCurrentStreak = 1;
    }
  }

  const newLongest = Math.max(newCurrentStreak, streak.longestStreak);

  return prisma.userStreak.update({
    where: { userId },
    data: {
      currentStreak: newCurrentStreak,
      longestStreak: newLongest,
      lastActiveAt: now,
    },
  });
}

export async function getDashboardStats(userId: string) {
  const [progressRecords, streak] = await Promise.all([
    prisma.userProgress.findMany({
      where: { userId },
      include: { project: true, conceptPage: true },
    }),
    prisma.userStreak.findUnique({ where: { userId } }),
  ]);

  const projectsStarted = progressRecords.filter(
    (p) => p.projectId && p.status === "started"
  ).length;
  const projectsCompleted = progressRecords.filter(
    (p) => p.projectId && p.status === "completed"
  ).length;
  const conceptsRead = progressRecords.filter(
    (p) => p.conceptPageId && p.status === "read"
  ).length;

  return {
    projectsStarted,
    projectsCompleted,
    conceptsRead,
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    lastActiveAt: streak?.lastActiveAt ?? null,
  };
}
