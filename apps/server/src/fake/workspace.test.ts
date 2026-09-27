import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { FAKE_NOTES_CONTENT, FAKE_NOTES_FILE } from "./fixture";
import { createFakeWorkspace } from "./workspace";

describe("createFakeWorkspace", () => {
  it("seeds a temp workspace with notes.txt", async () => {
    const ws = await createFakeWorkspace();
    try {
      expect(ws.root.length).toBeGreaterThan(0);
      expect(ws.notesPath.endsWith(FAKE_NOTES_FILE)).toBe(true);
      expect(await readFile(ws.notesPath, "utf8")).toBe(FAKE_NOTES_CONTENT);
    } finally {
      await ws.cleanup();
    }
  });

  it("removes the workspace on cleanup", async () => {
    const ws = await createFakeWorkspace();
    await ws.cleanup();
    await expect(readFile(ws.notesPath, "utf8")).rejects.toThrow();
  });
});
