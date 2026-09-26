import { describe, expect, it } from "vitest";
import { SHARED_VERSION } from "./index";

describe("shared", () => {
  it("exports a semver version string", () => {
    expect(SHARED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
