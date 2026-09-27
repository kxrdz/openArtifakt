import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import {
  FAKE_ARTIFACT_INTRO_TEXT,
  FAKE_CODE_LANGUAGE,
  FAKE_CODE_TITLE,
  FAKE_HTML_MARKER,
  FAKE_HTML_TITLE,
  FAKE_MERMAID_TITLE,
  FAKE_REACT_TITLE,
  FAKE_SVG_MARKER,
  FAKE_SVG_TITLE,
} from "../apps/server/src/fake/artifacts";

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
 * in both light and dark. The empty shell, a streaming conversation, a pending
 * approval card, the populated terminal log, each of the five artifact types
 * and the inline Mermaid syntax error are captured here; feature 8 adds the
 * settings drawer as that surface lands.
 *
 * This spec is a capture tool, not an assertion: it runs only under
 * `pnpm screenshots` (its own Playwright project), never under `pnpm check`.
 *
 * The webServer runs in fake-provider mode (§12.6), so the conversation
 * scenarios below replay the scripted fixture key-free: streaming text →
 * `edit_file` approval → `execute_command` approval → final answer → a
 * slow-streaming turn (for the mid-stream capture).
 */

/** Open the app, wait for the shell, and pin the requested theme. */
async function preparePage(page: Page, theme: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OpenArtifact" })).toBeVisible();

  // Override whatever the inline bootstrap chose, so each capture is in a
  // known theme.
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-theme", value);
  }, theme);
}

/** Capture the current screen into `docs/screenshots/<name>.png`. */
async function capture(page: Page, name: string): Promise<void> {
  // Wait for the self-hosted fonts so the capture shows the real type.
  await page.evaluate(() => document.fonts.ready);

  mkdirSync(screenshotsDir, { recursive: true });
  const path = `${screenshotsDir}/${name}.png`;
  const buffer = await page.screenshot({ path });

  expect(buffer.length).toBeGreaterThan(0);
  expect(existsSync(path)).toBe(true);
}

/** Type a message into the composer and send it. */
async function sendMessage(page: Page, text: string): Promise<void> {
  const composer = page.getByLabel("Message OpenArtifact");
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
}

/** Approve the pending `edit_file` request. */
async function approveEdit(page: Page): Promise<void> {
  const card = page.locator('section[aria-label="Approve edit_file"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
}

/** Approve the pending `execute_command` request so it actually runs. */
async function approveCommand(page: Page): Promise<void> {
  const card = page.locator('section[aria-label="Approve execute_command"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
}

/** Drive the scripted conversation to its end with both tools approved. */
async function completeApprovedConversation(page: Page): Promise<void> {
  await sendMessage(page, "Fix the notes file please");
  await approveEdit(page);
  await approveCommand(page);

  // The approved command ran (populating the terminal log) and the scripted
  // final answer ended the turn, so the composer is back to Send.
  await expect(page.getByText("notes.txt now says hello, world")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/**
 * Drive the scripted conversation through turns 1–4 and then the artifact turn
 * (turn 5), which streams one `<artifact>` block per type plus a valid and an
 * invalid ```mermaid fence. After this, all five artifacts live in the panel
 * and both diagrams live in the message list.
 */
async function completeArtifactTurn(page: Page): Promise<void> {
  await completeApprovedConversation(page);

  // Turn 4: the slow-streaming turn, consumed so the next message reaches the
  // artifact fixture.
  await sendMessage(page, "Consume the slow turn");
  await expect(page.getByText("This turn streams slowly")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  // Turn 5: the artifact fixture.
  await sendMessage(page, "Show me the artifact types");
  await expect(page.getByText(FAKE_ARTIFACT_INTRO_TEXT)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/**
 * Open the artifact panel — on narrow screens that means the full-screen sheet,
 * which has no open control on desktop (the panel is always visible inline) —
 * then select the artifact with the given title in the switcher.
 */
async function openArtifact(page: Page, title: string): Promise<void> {
  const openPanel = page.getByRole("button", { name: "Open artifact panel" });
  if (await openPanel.isVisible().catch(() => false)) {
    await openPanel.click();
  }
  await page.getByRole("button", { name: title, exact: true }).click();
}

/** A capture scenario: drive the UI into a state, then snapshot it. */
interface Scenario {
  name: string;
  run: (page: Page) => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    // Text streaming in mid-flight, with the "Working" state and Stop control.
    name: "conversation-streaming",
    run: async (page) => {
      await completeApprovedConversation(page);

      // The next turn replays the slow-streaming fixture; capture it part-way.
      await sendMessage(page, "Stream something long");
      await expect(page.getByText("This turn streams")).toBeVisible();
      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    },
  },
  {
    // The edit approval card paused on the streamed intro text.
    name: "approval",
    run: async (page) => {
      await sendMessage(page, "Fix the notes file please");
      await expect(page.locator('section[aria-label="Approve edit_file"]')).toBeVisible();
    },
  },
  {
    // The terminal log populated by the approved command's stdout.
    name: "terminal",
    run: async (page) => {
      await completeApprovedConversation(page);
      await expect(
        page.locator('section[aria-label="Terminal log"]').getByText("hello, world"),
      ).toBeVisible();
    },
  },
  {
    // The sandboxed React preview (§12.7) rendered in the artifact panel.
    name: "artifact-react",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_REACT_TITLE);
      await expect(
        page.frameLocator(`iframe[title="${FAKE_REACT_TITLE}"]`).getByText("React preview rendered"),
      ).toBeVisible();
    },
  },
  {
    // The sandboxed HTML preview (§12.7).
    name: "artifact-html",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_HTML_TITLE);
      await expect(
        page.frameLocator(`iframe[title="${FAKE_HTML_TITLE}"]`).getByText(FAKE_HTML_MARKER),
      ).toBeVisible();
    },
  },
  {
    // The sanitized, inlined SVG viewer (§12.7).
    name: "artifact-svg",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_SVG_TITLE);
      const svgPreview = page.locator('[aria-label="SVG preview"]');
      await expect(svgPreview.locator("svg")).toBeVisible();
      await expect(svgPreview).toContainText(FAKE_SVG_MARKER);
    },
  },
  {
    // The themed Mermaid artifact (§12.7) rendered in the panel.
    name: "artifact-mermaid",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_MERMAID_TITLE);
      await expect(
        page.locator('[aria-label="Mermaid diagram"]', { hasText: "Render" }),
      ).toBeVisible();
    },
  },
  {
    // The syntax-highlighted code artifact (§12.7).
    name: "artifact-code",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_CODE_TITLE);
      await expect(page.getByText(FAKE_CODE_LANGUAGE, { exact: true })).toBeVisible();
      await expect(page.locator("pre", { hasText: "answer" })).toContainText("const answer");
    },
  },
  {
    // The inline Mermaid syntax error (§12.7): the invalid ```mermaid fence
    // shows a line-numbered source with the offending line highlighted instead
    // of crashing the message list.
    name: "mermaid-error",
    run: async (page) => {
      await completeArtifactTurn(page);
      await expect(page.locator("[data-line-number]").first()).toBeVisible();
      await expect(page.locator('[data-offending="true"]')).toBeVisible();
      await expect(page.getByText(/BrokenFlow/)).toBeVisible();
    },
  },
];

for (const theme of themes) {
  for (const viewport of viewports) {
    test(`shell — ${theme} @ ${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await preparePage(page, theme);
      await capture(page, `shell-${theme}-${viewport.id}`);
    });

    for (const scenario of scenarios) {
      test(`${scenario.name} — ${theme} @ ${viewport.id}`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await preparePage(page, theme);
        await scenario.run(page);
        await capture(page, `${scenario.name}-${theme}-${viewport.id}`);
      });
    }
  }
}
