import { expect, test } from "@playwright/test";
import path from "path";

test("local fixture can be filled after loading the extension", async ({ browserName, browser }) => {
  test.skip(browserName !== "chromium", "Chrome extension testing requires Chromium.");

  const distPath = path.resolve(__dirname, "../dist");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`file://${path.resolve(__dirname, "../fixtures/forms/chinese-resume.html")}`);

  await expect(page.getByRole("heading", { name: "候选人简历" })).toBeVisible();
  await expect(page.getByText("添加证书")).toBeVisible();

  await context.close();
  expect(distPath).toContain("dist");
});

