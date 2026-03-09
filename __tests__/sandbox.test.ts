import { describe, it, expect } from "vitest";
import {
  validateSandboxCode,
  buildMockSandboxResult,
  getRateLimit,
} from "@/lib/sandbox";

describe("Feature: Interactive Sandbox", () => {
  describe("validateSandboxCode", () => {
    it("accepts valid CUDA code with main function", () => {
      const code = `#include <stdio.h>
__global__ void helloKernel() {
    printf("Hello from GPU\\n");
}
int main() {
    helloKernel<<<1, 4>>>();
    cudaDeviceSynchronize();
    return 0;
}`;
      const result = validateSandboxCode(code);
      expect(result.valid).toBe(true);
    });

    it("rejects empty code", () => {
      const result = validateSandboxCode("");
      expect(result.valid).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("rejects whitespace-only code", () => {
      const result = validateSandboxCode("   \n\t  ");
      expect(result.valid).toBe(false);
    });

    it("rejects code exceeding 50KB", () => {
      const bigCode = "a".repeat(51_000);
      const result = validateSandboxCode(bigCode);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/50KB/);
    });

    it("rejects code with system() call", () => {
      const code = `#include <stdio.h>
int main() {
    system("rm -rf /");
    return 0;
}`;
      const result = validateSandboxCode(code);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/disallowed/);
    });

    it("rejects code with exec()", () => {
      const code = `int main() { exec("/bin/sh"); return 0; }`;
      const result = validateSandboxCode(code);
      expect(result.valid).toBe(false);
    });

    it("rejects code with fork()", () => {
      const code = `int main() { fork(); return 0; }`;
      const result = validateSandboxCode(code);
      expect(result.valid).toBe(false);
    });

    it("accepts 50KB exactly (boundary)", () => {
      const code = "a".repeat(50_000);
      const result = validateSandboxCode(code);
      expect(result.valid).toBe(true);
    });
  });

  describe("buildMockSandboxResult", () => {
    it("returns completed status for valid code with main", () => {
      const code = `int main() { return 0; }`;
      const result = buildMockSandboxResult(code);
      expect(result.status).toBe("completed");
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it("returns failed status when no main function present", () => {
      const code = `__global__ void myKernel() {}`;
      const result = buildMockSandboxResult(code);
      expect(result.status).toBe("failed");
      expect(result.stderr).toContain("main");
    });

    it("includes stdout when code has printf", () => {
      const code = `#include <stdio.h>\nint main() { printf("hi\\n"); return 0; }`;
      const result = buildMockSandboxResult(code);
      expect(result.status).toBe("completed");
      expect(result.stdout?.length).toBeGreaterThan(0);
    });

    it("has empty stdout for code without printf", () => {
      const code = `int main() { return 0; }`;
      const result = buildMockSandboxResult(code);
      expect(result.stdout).toBe("");
    });
  });

  describe("getRateLimit", () => {
    it("allows more executions per hour for authenticated users", () => {
      const authed = getRateLimit("user-123");
      const anon = getRateLimit();
      expect(authed.maxPerHour).toBeGreaterThan(anon.maxPerHour);
    });

    it("allows larger code for authenticated users", () => {
      const authed = getRateLimit("user-123");
      const anon = getRateLimit();
      expect(authed.maxCodeLength).toBeGreaterThan(anon.maxCodeLength);
    });

    it("allows longer timeout for authenticated users", () => {
      const authed = getRateLimit("user-123");
      const anon = getRateLimit();
      expect(authed.maxTimeoutSeconds).toBeGreaterThanOrEqual(
        anon.maxTimeoutSeconds
      );
    });

    it("anonymous users have positive limits", () => {
      const limits = getRateLimit();
      expect(limits.maxPerHour).toBeGreaterThan(0);
      expect(limits.maxCodeLength).toBeGreaterThan(0);
      expect(limits.maxTimeoutSeconds).toBeGreaterThan(0);
    });
  });

  describe("sandbox security constraints", () => {
    const dangerousCodes = [
      { label: "system call", code: `int main() { system("ls"); return 0; }` },
      { label: "exec call", code: `int main() { exec("cmd"); return 0; }` },
      { label: "popen call", code: `int main() { popen("cmd", "r"); return 0; }` },
      { label: "fork call", code: `int main() { fork(); return 0; }` },
    ];

    for (const { label, code } of dangerousCodes) {
      it(`blocks ${label}`, () => {
        const result = validateSandboxCode(code);
        expect(result.valid).toBe(false);
      });
    }

    it("allows safe CUDA code through validation", () => {
      const safeCodes = [
        `#include <cuda_runtime.h>\nint main() { return 0; }`,
        `__global__ void k() {}\nint main() { k<<<1,1>>>(); return 0; }`,
        `#include <stdio.h>\nint main() { printf("ok\\n"); return 0; }`,
      ];
      for (const code of safeCodes) {
        expect(validateSandboxCode(code).valid, `Code should be valid: ${code.substring(0, 50)}`).toBe(true);
      }
    });
  });
});
