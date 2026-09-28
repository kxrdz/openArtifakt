import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { autoLoadEnv, findEnvFile } from "./env";

describe("env loading", () => {
  let testDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = path.join(tmpdir(), `openartifact-env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Restore process.env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    // Clean up temp directory
    try {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe("findEnvFile", () => {
    it("finds .env in the current working directory", () => {
      const envPath = path.join(testDir, ".env");
      writeFileSync(envPath, "FOO=bar\n");

      const found = findEnvFile({ cwd: testDir });
      expect(found).toBe(envPath);
    });

    it("accepts cwd as a direct string argument", () => {
      const envPath = path.join(testDir, ".env");
      writeFileSync(envPath, "FOO=bar\n");

      const found = findEnvFile(testDir);
      expect(found).toBe(envPath);
    });

    it("traverses ancestor directories to find .env", () => {
      // Structure: testDir/.env, testDir/apps/server
      const serverDir = path.join(testDir, "apps", "server");
      mkdirSync(serverDir, { recursive: true });
      const envPath = path.join(testDir, ".env");
      writeFileSync(envPath, "AN_ENV_VAR=1\n");

      const found = findEnvFile({ cwd: serverDir });
      expect(found).toBe(envPath);
    });

    it("stops traversal at .git boundary and does not escape above it", () => {
      // Structure:
      // testDir/.env (should NOT be reached)
      // testDir/sub-repo/.git
      // testDir/sub-repo/apps/server
      const outerEnv = path.join(testDir, ".env");
      writeFileSync(outerEnv, "OUTER=1\n");

      const subRepoDir = path.join(testDir, "sub-repo");
      mkdirSync(path.join(subRepoDir, ".git"), { recursive: true });

      const serverDir = path.join(subRepoDir, "apps", "server");
      mkdirSync(serverDir, { recursive: true });

      const found = findEnvFile({ cwd: serverDir });
      expect(found).toBeUndefined();
    });

    it("stops traversal at pnpm-workspace.yaml boundary", () => {
      // Structure:
      // testDir/.env (should NOT be reached)
      // testDir/workspace/pnpm-workspace.yaml
      // testDir/workspace/apps/server
      const outerEnv = path.join(testDir, ".env");
      writeFileSync(outerEnv, "OUTER=1\n");

      const workspaceDir = path.join(testDir, "workspace");
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(path.join(workspaceDir, "pnpm-workspace.yaml"), "packages: ['apps/*']\n");

      const serverDir = path.join(workspaceDir, "apps", "server");
      mkdirSync(serverDir, { recursive: true });

      const found = findEnvFile({ cwd: serverDir });
      expect(found).toBeUndefined();
    });

    it("returns explicit envPath when specified and file exists", () => {
      const customEnv = path.join(testDir, "custom.env");
      writeFileSync(customEnv, "CUSTOM=1\n");

      const found = findEnvFile({ cwd: testDir, envPath: "custom.env" });
      expect(found).toBe(customEnv);
    });

    it("returns undefined when explicit envPath does not exist", () => {
      const found = findEnvFile({ cwd: testDir, envPath: "nonexistent.env" });
      expect(found).toBeUndefined();
    });

    it("respects OPENARTIFACT_ENV_FILE environment variable", () => {
      const customEnv = path.join(testDir, "from-env.env");
      writeFileSync(customEnv, "FROM_ENV=1\n");

      process.env.OPENARTIFACT_ENV_FILE = customEnv;
      const found = findEnvFile({ cwd: testDir });
      expect(found).toBe(customEnv);
    });

    it("returns undefined when no .env exists anywhere in the tree", () => {
      const emptySubDir = path.join(testDir, "a", "b", "c");
      mkdirSync(emptySubDir, { recursive: true });

      const found = findEnvFile({ cwd: emptySubDir });
      expect(found).toBeUndefined();
    });
  });

  describe("autoLoadEnv", () => {
    it("loads variables from .env into process.env", () => {
      const envPath = path.join(testDir, ".env");
      const testKey = "TEST_AUTOLOAD_VAR_" + Math.random().toString(36).slice(2);
      writeFileSync(envPath, `${testKey}=loaded_value\n`);

      expect(process.env[testKey]).toBeUndefined();
      const result = autoLoadEnv({ cwd: testDir });

      expect(result.loaded).toBe(true);
      expect(result.path).toBe(envPath);
      expect(process.env[testKey]).toBe("loaded_value");
    });

    it("preserves pre-existing environment variables (does not overwrite)", () => {
      const envPath = path.join(testDir, ".env");
      const existingKey = "TEST_PREEXISTING_VAR_" + Math.random().toString(36).slice(2);
      const newKey = "TEST_NEW_VAR_" + Math.random().toString(36).slice(2);

      process.env[existingKey] = "original_value";
      writeFileSync(envPath, `${existingKey}=from_file\n${newKey}=from_file\n`);

      const result = autoLoadEnv({ cwd: testDir });

      expect(result.loaded).toBe(true);
      expect(process.env[existingKey]).toBe("original_value"); // Preserved!
      expect(process.env[newKey]).toBe("from_file");
    });

    it("handles missing .env gracefully without error", () => {
      const emptyDir = path.join(testDir, "empty");
      mkdirSync(emptyDir, { recursive: true });

      const result = autoLoadEnv({ cwd: emptyDir });
      expect(result.loaded).toBe(false);
      expect(result.path).toBeUndefined();
    });
  });
});
