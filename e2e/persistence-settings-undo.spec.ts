import { expect, test, type Page } from "@playwright/test";

import { FAKE_ARTIFACT_INTRO_TEXT, FAKE_CODE_TITLE } from "../apps/server/src/fake/artifacts";

/**
 * End-to-end coverage of feature 8: persistence, settings and undo (§12.8).
 *
 * The webServer runs in fake-provider mode (§12.6), so each conversation
 * replays the scripted fixture key-free against a seeded temp workspace. These
 * tests exercise the feature-8 seams end to end: reloading restores the
 * persisted conversation list and the restored conversation's artifact
 * versions, a settings change survives a reload, and "Undo this turn" restores
 * the file a completed turn edited.
 *
 * Two determinism rules keep this spec robust against the shared SQLite store
 * and the shared fake workspace:
 * - every conversation title and setting value is made unique with
 *   `Date.now()`, so rows from earlier runs (or parallel specs) never make an
 *   assertion ambiguous; and
 * - the undo assertion reads the *server's* restore result — surfaced as the
 *   inline outcome message — rather than the shared workspace file's bytes,
 *   which other parallel specs may also be editing. Content-level restoration
 *   is already proven by the server's `undo.test.ts`.
 */

const composerLabel = "Message OpenArtifact";

/** Type a message into the composer and send it. */
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

/** Drive the standard fixture conversation (edit → command → final answer). */
async function completeStandardConversation(page: Page, firstMessage: string): Promise<void> {
  await send(page, firstMessage);
  await approve(page, "Approve edit_file");
  await approve(page, "Approve execute_command");
  await expect(page.getByText("notes.txt now says hello, world")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

/** Drive through the slow turn to the artifact turn, which persists artifacts. */
async function completeArtifactConversation(page: Page, firstMessage: string): Promise<void> {
  await completeStandardConversation(page, firstMessage);

  // Turn 4: the slow-streaming fixture turn, consumed so the next message
  // reaches the artifact fixture (turn 5).
  await send(page, "Consume the slow turn");
  await expect(page.getByText("This turn streams slowly")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  await send(page, "Show me the artifact types");
  await expect(page.getByText(FAKE_ARTIFACT_INTRO_TEXT)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

test("reload restores the conversation list and artifact versions", async ({ page }) => {
  const title = `persist-${Date.now()}`;
  await page.goto("/");
  await completeArtifactConversation(page, title);

  // A fresh load starts from the persisted store, not the in-memory registry.
  await page.reload();
  await expect(page.getByRole("heading", { name: "OpenArtifact" })).toBeVisible();

  // The persisted conversation is listed in the history menu…
  await page.getByRole("button", { name: "Conversations" }).click();
  const menuItem = page.getByRole("menuitem", { name: title });
  await expect(menuItem).toBeVisible();

  // …and selecting it restores its messages and artifacts.
  await menuItem.click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(FAKE_ARTIFACT_INTRO_TEXT)).toBeVisible();

  // The first restored artifact keeps its version history (the dropdown shows
  // the stored version, marked latest).
  const reactVersionSelect = page.getByLabel("Version of Sandbox probe");
  await expect(reactVersionSelect).toBeVisible();
  await expect(reactVersionSelect).toHaveValue("1");
  await expect(reactVersionSelect.locator("option")).toContainText("v1 (latest)");

  // A later artifact restores too, with its content and version intact.
  await page.getByRole("button", { name: FAKE_CODE_TITLE, exact: true }).click();
  await expect(page.getByLabel(`Version of ${FAKE_CODE_TITLE}`)).toHaveValue("1");
  await expect(page.locator("pre", { hasText: "answer" })).toContainText("const answer");
});

test("a settings change persists across a reload", async ({ page }) => {
  const model = `e2e-model-${Date.now()}`;
  await page.goto("/");

  // Open the drawer, change the model, and save.
  await page.getByRole("button", { name: "Settings" }).click();
  const drawer = page.getByRole("dialog", { name: "Settings" });
  await expect(drawer).toBeVisible();

  const modelInput = drawer.getByLabel("Model", { exact: true });
  await expect(modelInput).toBeVisible();
  await modelInput.fill(model);
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();

  // The saved value is read back from the store, not the env-derived default.
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  const reloadedDrawer = page.getByRole("dialog", { name: "Settings" });
  await expect(reloadedDrawer).toBeVisible();
  await expect(reloadedDrawer.getByLabel("Model", { exact: true })).toHaveValue(model);
});

test("undo restores the file a completed turn edited", async ({ page }) => {
  await page.goto("/");

  // The standard conversation approves the scripted edit, so the completed
  // turn has a file mutation to undo.
  await send(page, "Undo this edit please");
  await approve(page, "Approve edit_file");
  await approve(page, "Approve execute_command");
  await expect(page.getByText("notes.txt now says hello, world")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  // The completed turn offers undo, and the server's restore result is
  // surfaced as the inline outcome (the `.before` snapshot of `notes.txt`).
  await page.getByRole("button", { name: "Undo this turn" }).click();
  await expect(page.getByText(/restored notes\.txt/)).toBeVisible();
});
