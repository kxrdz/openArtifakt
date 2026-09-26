import { describe, expect, it } from "vitest";

import { isSecretPath } from "./secrets";

describe("isSecretPath", () => {
  it("matches secret basenames", () => {
    const secrets = [
      ".env",
      ".env.local",
      ".env.production",
      "server.pem",
      "ca.key",
      "id_rsa",
      "id_rsa.pub",
    ];
    for (const p of secrets) {
      expect(isSecretPath(p), p).toBe(true);
    }
  });

  it("ignores non-secret names", () => {
    const notSecrets = ["main.ts", "README.md", "config.json", "foo.env", "env"];
    for (const p of notSecrets) {
      expect(isSecretPath(p), p).toBe(false);
    }
  });

  it("matches on the basename regardless of directory", () => {
    expect(isSecretPath("/workspace/.env")).toBe(true);
    expect(isSecretPath("/workspace/secrets/id_rsa")).toBe(true);
    expect(isSecretPath("/workspace/src/main.ts")).toBe(false);
  });
});
