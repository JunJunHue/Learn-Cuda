import { describe, it, expect, beforeEach } from "vitest";
import {
  validateEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  createUser,
  authenticateUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

describe("Feature: User Auth", () => {
  beforeEach(async () => {
    // Clean up users between tests
    await prisma.userProgress.deleteMany();
    await prisma.userStreak.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  describe("validateEmail", () => {
    it("accepts valid email addresses", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("cuda.dev+test@nvidia.co")).toBe(true);
    });

    it("rejects invalid email addresses", () => {
      expect(validateEmail("notanemail")).toBe(false);
      expect(validateEmail("missing@domain")).toBe(false);
      expect(validateEmail("@nodomain.com")).toBe(false);
      expect(validateEmail("")).toBe(false);
    });
  });

  describe("validatePassword", () => {
    it("accepts passwords of 8+ characters", () => {
      expect(validatePassword("strongpass").valid).toBe(true);
      expect(validatePassword("12345678").valid).toBe(true);
    });

    it("rejects passwords shorter than 8 characters", () => {
      const result = validatePassword("short");
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/8 characters/);
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("produces a hash that verifies correctly", async () => {
      const hash = await hashPassword("mypassword123");
      expect(hash).not.toBe("mypassword123");
      expect(hash.length).toBeGreaterThan(20);

      const valid = await verifyPassword("mypassword123", hash);
      expect(valid).toBe(true);
    });

    it("rejects wrong password against the hash", async () => {
      const hash = await hashPassword("correct-password");
      const valid = await verifyPassword("wrong-password", hash);
      expect(valid).toBe(false);
    });
  });

  describe("createUser", () => {
    it("creates a new user and streak record", async () => {
      const user = await createUser("test@example.com", "password123", "Test User");
      expect(user.email).toBe("test@example.com");
      expect(user.id).toBeTruthy();

      const streak = await prisma.userStreak.findUnique({
        where: { userId: user.id },
      });
      expect(streak).toBeTruthy();
      expect(streak?.currentStreak).toBe(0);
    });

    it("throws if email already registered", async () => {
      await createUser("dup@example.com", "password123");
      await expect(createUser("dup@example.com", "other123")).rejects.toThrow(
        "Email already registered"
      );
    });

    it("throws on invalid email", async () => {
      await expect(createUser("bademail", "password123")).rejects.toThrow(
        "Invalid email format"
      );
    });

    it("throws on short password", async () => {
      await expect(createUser("ok@example.com", "short")).rejects.toThrow(
        "8 characters"
      );
    });
  });

  describe("authenticateUser", () => {
    it("returns user on correct credentials", async () => {
      await createUser("login@example.com", "correctpass");
      const user = await authenticateUser("login@example.com", "correctpass");
      expect(user).not.toBeNull();
      expect(user?.email).toBe("login@example.com");
    });

    it("returns null on wrong password", async () => {
      await createUser("login2@example.com", "correctpass");
      const result = await authenticateUser("login2@example.com", "wrongpass");
      expect(result).toBeNull();
    });

    it("returns null for non-existent user", async () => {
      const result = await authenticateUser("nobody@example.com", "pass");
      expect(result).toBeNull();
    });
  });
});
