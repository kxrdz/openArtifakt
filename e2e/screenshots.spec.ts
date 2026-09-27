import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// `pnpm screenshots` always runs from the repo root (root package.json script),
// and Playwright keeps the process cwd as invoked. Anchoring on cwd (rather than
// `import.meta.url`, which Playwright rewrites for transpiled spec files) puts
// the captures in `docs/screenshots/` reliably.
const screenshotsDir = join(process.cwd(), "docs", "screenshots");

const themes = ["dark", "light"] as const;
const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;

/**
 * Capture the key surfaces into `docs/screenshots/` at 1440×900 and 390×844,
 * in both light and dark. Features 6–8 add captures for streaming
 * conversations, approvals, each artifact type, Mermaid errors and the
 * settings drawer as those surfaces land.
 *
 * This spec is a capture tool, not an assertion: it runs only under
 * `pnpm screenshots` (its own Playwright project), never under `pnpm check`.
 */
for (const theme of themes) {
  for (const viewport of viewports) {
    test(`empty shell — ${theme} @ ${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "OpenArtifact" }),
      ).toBeVisible();

      // Override whatever the inline bootstrap chose, so each capture is in a
      // known theme.
      await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
      }, theme);

      // Wait for the self-hosted fonts so the capture shows the real type.
      await page.evaluate(() => document.fonts.ready);

      const path = `${screenshotsDir}/shell-${theme}-${viewport.id}.png`;
      mkdirSync(screenshotsDir, { recursive: true });
      const buffer = await page.screenshot({ path });

      expect(buffer.length).toBeGreaterThan(0);
      expect(existsSync(path)).toBe(true);
    });
  }
}
