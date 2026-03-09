import { describe, it, expect } from "vitest";
import {
  CONCEPTS,
  getConceptBySlug,
  getConceptsByCategory,
  searchConcepts,
} from "@/data/concepts";

describe("Feature: GPU/CUDA Concept Pages", () => {
  describe("Data integrity", () => {
    it("has at least 4 concept pages", () => {
      expect(CONCEPTS.length).toBeGreaterThanOrEqual(4);
    });

    it("all concept pages have required fields", () => {
      for (const concept of CONCEPTS) {
        expect(concept.slug, `${concept.slug} missing slug`).toBeTruthy();
        expect(concept.title, `${concept.slug} missing title`).toBeTruthy();
        expect(concept.category, `${concept.slug} missing category`).toBeTruthy();
        expect(concept.content, `${concept.slug} missing content`).toBeTruthy();
        expect(
          concept.content.length,
          `${concept.slug} content too short`
        ).toBeGreaterThan(100);
        expect(Array.isArray(concept.relatedProjects)).toBe(true);
        expect(Array.isArray(concept.relatedConcepts)).toBe(true);
      }
    });

    it("all concept slugs are unique", () => {
      const slugs = CONCEPTS.map((c) => c.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it("concept pages have logical order values", () => {
      const orders = CONCEPTS.map((c) => c.order);
      expect(orders.every((o) => o >= 0)).toBe(true);
    });

    it("each concept has example code", () => {
      for (const concept of CONCEPTS) {
        expect(
          concept.codeExample,
          `${concept.slug} missing code example`
        ).toBeTruthy();
        expect(
          concept.codeExample?.length ?? 0,
          `${concept.slug} code example too short`
        ).toBeGreaterThan(20);
      }
    });

    it("concepts cover multiple GPU memory types", () => {
      const memConcepts = CONCEPTS.filter((c) => c.category === "Memory");
      expect(memConcepts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getConceptBySlug", () => {
    it("returns the correct concept for a known slug", () => {
      const concept = getConceptBySlug("gpu-thread-hierarchy");
      expect(concept).toBeDefined();
      expect(concept?.title).toContain("Thread Hierarchy");
    });

    it("returns undefined for unknown slug", () => {
      expect(getConceptBySlug("nonexistent-concept")).toBeUndefined();
    });
  });

  describe("getConceptsByCategory", () => {
    it("returns concepts in order", () => {
      const memoryConcepts = getConceptsByCategory("Memory");
      expect(memoryConcepts.length).toBeGreaterThan(0);
      for (let i = 1; i < memoryConcepts.length; i++) {
        expect(memoryConcepts[i].order).toBeGreaterThanOrEqual(
          memoryConcepts[i - 1].order
        );
      }
    });

    it("returns all Memory concepts", () => {
      const memoryConcepts = getConceptsByCategory("Memory");
      expect(memoryConcepts.every((c) => c.category === "Memory")).toBe(true);
    });

    it("returns empty array for category with no concepts", () => {
      const results = getConceptsByCategory("UnknownCategory");
      expect(results).toHaveLength(0);
    });
  });

  describe("searchConcepts", () => {
    it("finds concepts by title keyword", () => {
      const results = searchConcepts("warp");
      expect(results.length).toBeGreaterThan(0);
    });

    it("finds concepts by content keyword", () => {
      const results = searchConcepts("bank conflict");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.slug === "shared-memory")).toBe(true);
    });

    it("is case-insensitive", () => {
      const lower = searchConcepts("memory");
      const upper = searchConcepts("MEMORY");
      expect(lower.length).toBe(upper.length);
    });

    it("returns empty for no match", () => {
      expect(searchConcepts("zzznomatch999")).toHaveLength(0);
    });
  });

  describe("content quality", () => {
    it("thread hierarchy concept mentions threadIdx and blockIdx", () => {
      const concept = getConceptBySlug("gpu-thread-hierarchy");
      expect(concept?.content).toContain("threadIdx");
      expect(concept?.content).toContain("blockIdx");
    });

    it("coalescing concept mentions bandwidth", () => {
      const concept = getConceptBySlug("global-memory-coalescing");
      expect(concept?.content.toLowerCase()).toContain("bandwidth");
    });

    it("shared memory concept mentions bank conflicts", () => {
      const concept = getConceptBySlug("shared-memory");
      expect(concept?.content.toLowerCase()).toContain("bank conflict");
    });

    it("all concepts link to at least one project", () => {
      for (const concept of CONCEPTS) {
        expect(
          concept.relatedProjects.length,
          `${concept.slug} has no related projects`
        ).toBeGreaterThan(0);
      }
    });
  });
});
