import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of a full fake-provider conversation (§12.6).
 *
 * The e2e webServer runs with `OPENARTIFACT_FAKE_PROVIDER=1`, so the server
 * replays the scripted fixture (streaming text → `edit_file` approval →
 * `execute_command` approval → final answer → a slow-streaming turn for Stop)
 * against a seeded temp workspace — no API key or network required. These
 * tests drive the real UI: the composer, the streamed message list, the
 * approval cards and the Stop control.
 */

/** Approve an edit, reject a command with a note, and reach the final answer. */
async function runFullFakeConversation(page: Page): Promise<void> {
  const composer = page.getByLabel("Message OpenArtifact");
  await expect(composer).toBeVisible();

  await composer.fill("Fix the notes file please");
  await composer.press("Enter");

  // The user message renders and the intro text streams in before any tool.
  await expect(page.getByText("Fix the notes file please")).toBeVisible();
  await expect(page.getByText("I'll update the notes file")).toBeVisible();

  // First approval: the edit. The card shows the target path and the proposed
  // new text; approve it.
  const editCard = page.locator('section[aria-label="Approve edit_file"]');
  await expect(editCard).toBeVisible();
  await expect(editCard.getByText("notes.txt")).toBeVisible();
  await expect(editCard.getByText("hello, world")).toBeVisible();
  await editCard.getByRole("button", { name: "Approve" }).click();

  // Second approval: the command. The card shows the full command and working
  // directory; reject it with a note.
  const commandCard = page.locator('section[aria-label="Approve execute_command"]');
  await expect(commandCard).toBeVisible();
  await expect(commandCard.getByLabel("Command")).toHaveValue(/notes\.txt/);
  await expect(commandCard.getByText(/Working directory:/)).toBeVisible();
  await commandCard.getByRole("button", { name: "Reject" }).click();
  await commandCard.getByLabel("Rejection note").fill("skip the command");
  await commandCard.getByRole("button", { name: "Send rejection" }).click();

  // The final answer streams in and the turn ends.
  await expect(page.getByText("notes.txt now says hello, world")).toBeVisible();
  await expect(page.locator("header").getByText("Done", { exact: true })).toBeVisible();

  // The approved edit ended "Done"; the rejected command ended "Error".
  await expect(
    page.locator("details", { hasText: "edit_file" }).getByText("Done", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("details", { hasText: "execute_command" }).getByText("Error", { exact: true }),
  ).toBeVisible();
}

test("plays a full fake conversation: stream, approve edit, reject command, final answer", async ({
  page,
}) => {
  await page.goto("/");
  await runFullFakeConversation(page);
});

test("Stop cancels a slow-streaming turn", async ({ page }) => {
  await page.goto("/");
  await runFullFakeConversation(page);

  // The composer is back to Send (the previous turn finished) before the next
  // message, so the send is not swallowed by an in-flight turn.
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  const composer = page.getByLabel("Message OpenArtifact");
  await composer.fill("Stream something long");
  await composer.press("Enter");

  // The fourth fixture turn streams in slow chunks, giving Stop a real
  // in-flight turn to interrupt.
  const stopButton = page.getByRole("button", { name: "Stop" });
  await expect(stopButton).toBeVisible();
  await expect(page.getByText("This turn streams slowly")).toBeVisible();
  await stopButton.click();

  // The turn is cancelled and the composer returns to Send.
  await expect(page.locator("header").getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
