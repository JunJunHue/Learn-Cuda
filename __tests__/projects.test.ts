import { describe, it, expect } from "vitest";
import {
  PROJECTS,
  getProjectBySlug,
  getProjectsByCategory,
  getProjectsByDifficulty,
  searchProjects,
  CATEGORIES,
  DIFFICULTIES,
} from "@/data/projects";

describe("Feature: Project Database", () => {
  describe("Data integrity", () => {
    it("has at least 5 projects", () => {
      expect(PROJECTS.length).toBeGreaterThanOrEqual(5);
    });

    it("all projects have required fields", () => {
      for (const project of PROJECTS) {
        expect(project.slug, `${project.slug} missing slug`).toBeTruthy();
        expect(project.title, `${project.slug} missing title`).toBeTruthy();
        expect(project.description, `${project.slug} missing description`).toBeTruthy();
        expect(
          ["Beginner", "Intermediate", "Advanced"],
          `${project.slug} invalid difficulty`
        ).toContain(project.difficulty);
        expect(CATEGORIES, `${project.slug} invalid category`).toContain(
          project.category
        );
        expect(
          project.estimatedMinutes,
          `${project.slug} missing time estimate`
        ).toBeGreaterThan(0);
        expect(project.starterCode, `${project.slug} missing starter code`).toBeTruthy();
      }
    });

    it("all project slugs are unique", () => {
      const slugs = PROJECTS.map((p) => p.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it("all prerequisites reference existing project slugs", () => {
      const slugSet = new Set(PROJECTS.map((p) => p.slug));
      for (const project of PROJECTS) {
        for (const prereq of project.prerequisites) {
          expect(
            slugSet.has(prereq),
            `${project.slug} has unknown prereq: ${prereq}`
          ).toBe(true);
        }
      }
    });

    it("represents all difficulty levels", () => {
      for (const diff of DIFFICULTIES) {
        const found = PROJECTS.some((p) => p.difficulty === diff);
        expect(found, `No projects with difficulty: ${diff}`).toBe(true);
      }
    });
  });

  describe("getProjectBySlug", () => {
    it("returns the correct project for a valid slug", () => {
      const project = getProjectBySlug("hello-cuda");
      expect(project).toBeDefined();
      expect(project?.title).toBe("Hello CUDA");
    });

    it("returns undefined for unknown slug", () => {
      expect(getProjectBySlug("does-not-exist")).toBeUndefined();
    });
  });

  describe("getProjectsByCategory", () => {
    it("returns only projects in the given category", () => {
      const memProjects = getProjectsByCategory("Memory");
      expect(memProjects.length).toBeGreaterThan(0);
      expect(memProjects.every((p) => p.category === "Memory")).toBe(true);
    });

    it("returns beginner-friendly projects in Parallelism", () => {
      const projects = getProjectsByCategory("Parallelism");
      expect(projects.some((p) => p.difficulty === "Beginner")).toBe(true);
    });
  });

  describe("getProjectsByDifficulty", () => {
    it("returns only projects of the given difficulty", () => {
      const beginners = getProjectsByDifficulty("Beginner");
      expect(beginners.length).toBeGreaterThan(0);
      expect(beginners.every((p) => p.difficulty === "Beginner")).toBe(true);
    });

    it("returns advanced projects", () => {
      const advanced = getProjectsByDifficulty("Advanced");
      expect(advanced.length).toBeGreaterThan(0);
    });
  });

  describe("searchProjects", () => {
    it("finds projects by title keyword", () => {
      const results = searchProjects("vector");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((p) => p.slug === "vector-add")).toBe(true);
    });

    it("finds projects by description keyword", () => {
      const results = searchProjects("bandwidth");
      expect(results.length).toBeGreaterThan(0);
    });

    it("finds projects by tag", () => {
      const results = searchProjects("warp");
      expect(results.length).toBeGreaterThan(0);
    });

    it("returns empty array for no matches", () => {
      const results = searchProjects("zzzzunlikelymatch1234");
      expect(results).toHaveLength(0);
    });

    it("is case-insensitive", () => {
      const lower = searchProjects("matrix");
      const upper = searchProjects("MATRIX");
      expect(lower.length).toBe(upper.length);
    });
  });
});
