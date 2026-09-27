import { expect, test, type Page } from "@playwright/test";

import {
  FAKE_ARTIFACT_INTRO_TEXT,
  FAKE_CODE_LANGUAGE,
  FAKE_CODE_SOURCE,
  FAKE_CODE_TITLE,
  FAKE_HTML_MARKER,
  FAKE_HTML_TITLE,
  FAKE_INVALID_MERMAID_SOURCE,
  FAKE_MERMAID_TITLE,
  FAKE_REACT_ACCESSIBLE_MARKER,
  FAKE_REACT_SANDBOXED_MARKER,
  FAKE_REACT_TITLE,
  FAKE_SVG_MARKER,
  FAKE_SVG_TITLE,
  FAKE_VALID_MERMAID_SOURCE,
} from "../apps/server/src/fake/artifacts";

/**
 * End-to-end coverage of the artifact renderers (§12.7).
 *
 * The webServer runs in fake-provider mode (§12.6), so the scripted fixture
 * replays key-free. After the standard conversation (turns 1–3) and the
 * slow-streaming turn (turn 4), the artifact turn (turn 5) streams one
 * `<artifact>` block per type plus a valid and an invalid ```mermaid fence.
 * This spec asserts every type renders in the panel, the sandboxed preview
 * cannot reach `window.parent.document`, and the invalid diagram shows an
 * inline syntax error without crashing the message list.
 */

const composerLabel = "Message OpenArtifact";

/** Send a message through the composer. */
async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByLabel(composerLabel);
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
}

/** Drive turns 1–3 (edit → command → final answer), both tools approved. */
async function completeStandardConversation(page: Page): Promise<void> {
  await send(page, "Fix the notes file please");
  await expect(page.getByText("I'll update the notes file")).toBeVisible();

  const editCard = page.locator('section[aria-label="Approve edit_file"]');
  await expect(editCard).toBeVisible();
  await editCard.getByRole("button", { name: "Approve" }).click();

  const commandCard = page.locator('section[aria-label="Approve execute_command"]');
  await expect(commandCard).toBeVisible();
  await commandCard.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("notes.txt now says hello, world")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/** Open one artifact in the panel switcher. */
async function openArtifact(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).click();
}

test("renders every artifact type, blocks sandbox parent access, and shows inline Mermaid errors", async ({
  page,
}) => {
  await page.goto("/");

  // Consume turns 1–3 (standard conversation) and turn 4 (slow streaming) so
  // the next message reaches the artifact turn.
  await completeStandardConversation(page);
  await send(page, "Consume the slow turn");
  await expect(page.getByText("This turn streams slowly")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  await send(page, "Show me the artifact types");
  await expect(page.getByText(FAKE_ARTIFACT_INTRO_TEXT)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  // The valid inline fence renders as a diagram…
  await expect(
    page.locator('[aria-label="Mermaid diagram"]', { hasText: "ValidFlow" }),
  ).toBeVisible();

  // …and the invalid fence renders as an inline syntax error (line-numbered
  // source, offending line highlighted) instead of crashing the message list.
  await expect(page.locator("[data-line-number]").first()).toBeVisible();
  await expect(page.locator('[data-offending="true"]')).toBeVisible();
  await expect(page.getByText(/BrokenFlow/)).toBeVisible();
  // The prose around the diagrams is still there (the list did not crash).
  await expect(page.getByText(FAKE_ARTIFACT_INTRO_TEXT)).toBeVisible();

  // React: the sandboxed preview renders, and its own probe confirms the
  // sandbox blocks `window.parent.document`.
  await openArtifact(page, FAKE_REACT_TITLE);
  const reactFrame = page.frameLocator(`iframe[title="${FAKE_REACT_TITLE}"]`);
  await expect(reactFrame.getByText("React preview rendered")).toBeVisible();
  await expect(reactFrame.locator("body")).toContainText(FAKE_REACT_SANDBOXED_MARKER);
  await expect(reactFrame.locator("body")).not.toContainText(FAKE_REACT_ACCESSIBLE_MARKER);

  // Direct cross-origin probe: reading the parent document must throw.
  // (The sandboxed iframe is opaque-origin, so we find its frame and evaluate
  // inside it — `Locator.contentFrame()` returns a FrameLocator, not a Frame.)
  const sandboxFrame = page.frames().find((f) => f.url() === "about:srcdoc");
  expect(sandboxFrame).toBeDefined();
  const access = await sandboxFrame!.evaluate(() => {
    try {
      void window.parent.document;
      return "accessible";
    } catch {
      return "blocked";
    }
  });
  expect(access).toBe("blocked");

  // HTML renders inside its own sandboxed iframe.
  await openArtifact(page, FAKE_HTML_TITLE);
  await expect(
    page.frameLocator(`iframe[title="${FAKE_HTML_TITLE}"]`).getByText(FAKE_HTML_MARKER),
  ).toBeVisible();

  // SVG is sanitized and inlined.
  await openArtifact(page, FAKE_SVG_TITLE);
  const svgPreview = page.locator('[aria-label="SVG preview"]');
  await expect(svgPreview.locator("svg")).toBeVisible();
  await expect(svgPreview).toContainText(FAKE_SVG_MARKER);

  // Mermaid artifact renders a diagram (distinct from the inline one).
  await openArtifact(page, FAKE_MERMAID_TITLE);
  await expect(
    page.locator('[aria-label="Mermaid diagram"]', { hasText: "Render" }),
  ).toBeVisible();

  // Code artifact renders highlighted source with the declared language.
  await openArtifact(page, FAKE_CODE_TITLE);
  await expect(page.getByText(FAKE_CODE_LANGUAGE, { exact: true })).toBeVisible();
  await expect(page.locator("pre", { hasText: "answer" })).toContainText("const answer");
});

// Guard against fixture drift: the markers the assertions rely on must actually
// appear in the scripted sources (a cheap, deterministic sanity check).
test("artifact fixture sources carry the asserted markers", () => {
  expect(FAKE_CODE_SOURCE).toContain("const answer");
  expect(FAKE_VALID_MERMAID_SOURCE).toContain("ValidFlow");
  expect(FAKE_INVALID_MERMAID_SOURCE).toContain("BrokenFlow");
});
