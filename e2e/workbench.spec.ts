import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SAMPLE } from "../src/domain/sample";
async function start(page: Page) {
  await page
    .getByRole("button", { name: "Start rehearsal", exact: true })
    .click();
  await page.getByLabel("Coordinator name").fill("Test coordinator");
  await page.getByRole("button", { name: "Begin rehearsal" }).click();
}
const row = (page: Page, title: string) =>
  page
    .locator("button.step-row")
    .filter({ has: page.getByText(title, { exact: true }) });
async function select(page: Page, title: string) {
  await row(page, title).click();
}
async function complete(page: Page) {
  await page.getByRole("button", { name: "Start this step" }).click();
  await page
    .getByLabel("Evidence or failure note")
    .fill("Observed test result: passed.");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("records evidence, persists reload and pauses on failure", async ({
  page,
}) => {
  await start(page);
  await select(page, "Verify the recovery point");
  await expect(
    page.getByRole("button", { name: "Start this step" }),
  ).toHaveCount(0);
  await select(page, "Confirm the release baseline");
  await complete(page);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Plan overview" }).getByText(/1 \/ 8/),
  ).toBeVisible();
  await select(page, "Deploy the canary");
  await page.getByRole("button", { name: "Start this step" }).click();
  await page
    .getByLabel("Evidence or failure note")
    .fill("Acceptance check failed.");
  await page.getByRole("button", { name: "Record failure" }).click();
  await expect(
    page.getByText("Rehearsal paused", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Decision note")
    .fill("Issue corrected in rehearsal. Repeat the canary.");
  await page.getByRole("button", { name: "Resume & retry failed" }).click();
  await expect(
    page.getByRole("button", { name: "Start this step" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Acceptance check failed.", { exact: true }),
  ).toBeVisible();
});
test("completes the full dependency graph and exports a real JSON download", async ({
  page,
}) => {
  await start(page);
  for (const step of SAMPLE.plan.steps) {
    await select(page, step.title);
    await complete(page);
  }
  await expect(
    page.getByText("Rehearsal completed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Workspace JSON/ }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe("payments-cutover-document.json");
  const stream = await downloaded.createReadStream();
  let raw = "";
  for await (const chunk of stream!) raw += chunk.toString();
  const document = JSON.parse(raw);
  expect(document.run.events).toHaveLength(17);
  expect(
    document.run.events.filter((e: { type: string }) => e.type === "complete"),
  ).toHaveLength(8);
});
test("rejects a cyclic edit without changing the saved plan", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Edit selected step" }).click();
  await page
    .getByRole("checkbox", { name: "Complete the operational handoff" })
    .check();
  await page.getByRole("button", { name: "Save step" }).click();
  await expect(page.getByRole("alert")).toContainText("cycle");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("No prerequisites. This step can start first."),
  ).toBeVisible();
});
test("imports a valid custom plan and preserves the workspace on invalid input", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Choose JSON file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.getByRole("alert")).toContainText("not valid JSON");
  await expect(
    page.getByRole("button", { name: "Replace local document" }),
  ).toBeDisabled();
  const imported = structuredClone(SAMPLE);
  imported.plan.title = "My migration rehearsal";
  await page.getByLabel("Choose JSON file").setInputFiles({
    name: "plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole("button", { name: "Replace local document" }).click();
  await expect(
    page.getByRole("heading", { name: "My migration rehearsal", exact: true }),
  ).toBeVisible();
});
test("detects another tab changing the workspace", async ({
  page,
  context,
}) => {
  await start(page);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Start this step" }).click();
  await expect(page.getByRole("alert")).toContainText("Another tab");
  await expect(
    page.getByRole("button", { name: "Start this step" }),
  ).toBeDisabled();
});
test("recovers corrupt storage without overwriting the original", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem("cutover-desk.document.v1", "{broken"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("not been overwritten");
  expect(
    await page.evaluate(() => localStorage.getItem("cutover-desk.document.v1")),
  ).toBe("{broken");
});
test("fits narrow screens without page-level horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Payments service cutover" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("has no automated accessibility violations on planning and active forms", async ({
  page,
}) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await start(page);
  await page.getByRole("button", { name: "Start this step" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("keeps a rehearsal usable when storage reads and writes are denied", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Denied", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Denied", "SecurityError");
    };
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await start(page);
  await complete(page);
  await expect(
    page.getByRole("region", { name: "Plan overview" }).getByText(/1 \/ 8/),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Export JSON");
});
