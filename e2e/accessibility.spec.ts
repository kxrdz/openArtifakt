import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  FAKE_CODE_LANGUAGE,
  FAKE_CODE_TITLE,
  FAKE_HTML_MARKER,
  FAKE_HTML_TITLE,
  FAKE_MERMAID_TITLE,
  FAKE_REACT_TITLE,
  FAKE_SVG_MARKER,
  FAKE_SVG_TITLE,
} from "../apps/server/src/fake/artifacts";

/**
 * Accessibility assertion suite for the final design pass (§12.9, task 11.1).
 *
 * Every screen the `pnpm screenshots` capture is driven here and passed through
 * axe-core, asserting zero *serious* or *critical* violations. The webServer
 * runs in fake-provider mode (§12.6), so the conversation scenarios replay the
 * scripted fixture key-free — identical driving to the screenshot spec, but
 * asserted rather than captured. Sandboxed artifact previews (React, HTML) live
 * in opaque-origin iframes; axe skips those frames and audits the surrounding
 * chrome (panel, switcher, controls), which is the surface the user interacts
 * with.
 */

const composerLabel = "Message OpenArtifact";

/** Format axe violations into a readable summary for a failing assertion. */
function summarize(violations: { id: string; impact: string; help: string; nodes: unknown[] }[]): string {
  if (violations.length === 0) return "none";
  return violations
    .map((violation) => `- ${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`)
    .join("\n");
}

/** Run axe on the current page and assert no serious or critical violations. */
async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(severe, `serious/critical axe violations:\n${summarize(severe)}`).toEqual([]);
}

/** Send a message through the composer. */
async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByLabel(composerLabel);
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
}

/** Approve the pending approval card with the given `aria-label`. */
async function approve(page: Page, cardLabel: string): Promise<void> {
  const card = page.locator(`section[aria-label="${cardLabel}"]`);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
}

/** Drive turns 1–3 (edit → command → final answer), both tools approved. */
async function completeStandardConversation(page: Page): Promise<void> {
  await send(page, "Fix the notes file please");
  await approve(page, "Approve edit_file");
  await approve(page, "Approve execute_command");
  await expect(page.getByText("notes.txt now says hello, world")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/** Drive through the slow turn to the artifact turn (turn 5). */
async function completeArtifactTurn(page: Page): Promise<void> {
  await completeStandardConversation(page);

  // Turn 4: the slow-streaming fixture turn, consumed so the next message
  // reaches the artifact fixture (turn 5).
  await send(page, "Consume the slow turn");
  await expect(page.getByText("This turn streams slowly")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  await send(page, "Show me the artifact types");
  await expect(page.getByText("Here are the artifact types:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/** Open one artifact in the panel switcher. */
async function openArtifact(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).click();
}

/** A screen to drive into a state, then axe-audit. */
interface Scenario {
  name: string;
  run: (page: Page) => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    name: "empty shell",
    run: async (page) => {
      await expect(page.getByRole("heading", { name: "OpenArtifact" })).toBeVisible();
    },
  },
  {
    name: "streaming conversation",
    run: async (page) => {
      await completeStandardConversation(page);
      await send(page, "Stream something long");
      await expect(page.getByText("This turn streams")).toBeVisible();
      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    },
  },
  {
    name: "pending approval",
    run: async (page) => {
      await send(page, "Fix the notes file please");
      await expect(page.locator('section[aria-label="Approve edit_file"]')).toBeVisible();
    },
  },
  {
    name: "react artifact",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_REACT_TITLE);
      await expect(
        page.frameLocator(`iframe[title="${FAKE_REACT_TITLE}"]`).getByText("React preview rendered"),
      ).toBeVisible();
    },
  },
  {
    name: "html artifact",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_HTML_TITLE);
      await expect(
        page.frameLocator(`iframe[title="${FAKE_HTML_TITLE}"]`).getByText(FAKE_HTML_MARKER),
      ).toBeVisible();
    },
  },
  {
    name: "svg artifact",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_SVG_TITLE);
      const svgPreview = page.locator('[aria-label="SVG preview"]');
      await expect(svgPreview.locator("svg")).toBeVisible();
      await expect(svgPreview).toContainText(FAKE_SVG_MARKER);
    },
  },
  {
    name: "mermaid artifact",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_MERMAID_TITLE);
      await expect(
        page.locator('[aria-label="Mermaid diagram"]', { hasText: "Render" }),
      ).toBeVisible();
    },
  },
  {
    name: "code artifact",
    run: async (page) => {
      await completeArtifactTurn(page);
      await openArtifact(page, FAKE_CODE_TITLE);
      await expect(page.getByText(FAKE_CODE_LANGUAGE, { exact: true })).toBeVisible();
      await expect(page.locator("pre", { hasText: "answer" })).toContainText("const answer");
    },
  },
  {
    name: "mermaid error",
    run: async (page) => {
      await completeArtifactTurn(page);
      await expect(page.locator("[data-line-number]").first()).toBeVisible();
      await expect(page.locator('[data-offending="true"]')).toBeVisible();
      await expect(page.getByText(/BrokenFlow/)).toBeVisible();
    },
  },
  {
    name: "settings drawer",
    run: async (page) => {
      await page.getByRole("button", { name: "Settings" }).click();
      const drawer = page.getByRole("dialog", { name: "Settings" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Save" })).toBeVisible();
    },
  },
  {
    name: "command palette",
    run: async (page) => {
      await page.keyboard.press("Control+K");
      const palette = page.getByRole("dialog", { name: "Command palette" });
      await expect(palette).toBeVisible();
      await expect(page.getByLabel("Search commands")).toBeVisible();
    },
  },
];

for (const scenario of scenarios) {
  test(`${scenario.name} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "OpenArtifact" })).toBeVisible();
    await scenario.run(page);
    await expectNoSeriousOrCriticalViolations(page);
  });
}
