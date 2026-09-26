import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("page loads with no serious or critical axe violations", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("OpenArtifact");
  await expect(page.getByRole("heading", { level: 1, name: "OpenArtifact" })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  const severeViolations = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  expect(severeViolations).toEqual([]);
});
