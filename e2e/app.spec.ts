import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoPlan, today } from "../lib/budget";
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3100";
async function login(page: Page) {
  const r = await page.request.post("/api/e2e/sign-in", {
    data: { who: "owner" },
  });
  expect(r.ok(), await r.text()).toBe(true);
  const current = await (await page.request.get("/api/plan")).json();
  const save = await page.request.put("/api/plan", {
    data: { plan: demoPlan(), revision: current.revision },
  });
  expect(save.ok()).toBe(true);
  const tx = await (await page.request.get("/api/transactions")).json();
  for (const t of tx)
    expect(
      (
        await page.request.delete(`/api/transactions/${t.id}`, {
          data: { expected: t },
        })
      ).ok(),
    ).toBe(true);
  await page.goto("/budget");
  await expect(
    page.getByRole("heading", { name: "Know where your money stands." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
}
test("AUTH-01 signed-out data and exports are blocked; landing is accessible", async ({
  page,
}) => {
  for (const route of [
    "/api/plan",
    "/api/transactions",
    "/api/checking",
    "/api/export",
  ])
    expect((await page.request.get(route)).status()).toBe(401);
  expect((await page.request.put("/api/plan", { data: {} })).status()).toBe(
    401,
  );
  expect(
    (await page.request.post("/api/transactions", { data: {} })).status(),
  ).toBe(401);
  expect((await page.request.put("/api/checking", { data: {} })).status()).toBe(
    401,
  );
  expect(
    (
      await page.request.post("/api/transactions/import", { data: {} })
    ).status(),
  ).toBe(401);
  await page.goto("/budget");
  await expect(page).toHaveURL(origin + "/");
  await expect(page.getByRole("heading", { name: /Make room/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("PLAN-01 edits save and survive reload; stale writes are rejected", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Take-home pay", { exact: true }).fill("3100");
  await page.getByLabel("Take-home pay", { exact: true }).blur();
  const previous = await (await page.request.get("/api/plan")).json();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save plan", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
  await expect(page.getByLabel("Take-home pay", { exact: true })).toHaveValue(
    "3100",
  );
  expect(
    (
      await page.request.put("/api/plan", {
        data: { plan: previous.plan, revision: previous.revision },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.put("/api/plan", {
        data: previous,
        headers: { Origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
});
test("PLAN-02 category sliders cap at income; lower income warns", async ({
  page,
}) => {
  await login(page);
  const input = page.getByLabel("Groceries amount", { exact: true });
  await input.fill("999999");
  await input.blur();
  const n = Number(await input.inputValue());
  expect(n).toBeLessThan(3000);
  await page.getByLabel("Take-home pay", { exact: true }).fill("100");
  await page.getByLabel("Take-home pay", { exact: true }).blur();
  await expect(page.getByText(/Your allocations exceed income/)).toBeVisible();
});
test("LEDGER-01 income/expense CRUD persists, compares amounts and exports CSV", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Checking", exact: true }).click();
  await page
    .getByRole("button", { name: "Log transaction", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Weekly groceries");
  await page.getByLabel("Amount (USD)").fill("48.25");
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    page.getByText("Weekly groceries", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
  await page.getByRole("button", { name: "Checking", exact: true }).click();
  await expect(
    page.getByText("Weekly groceries", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Checking", exact: true }).click();
  await page.getByRole("button", { name: "Edit Weekly groceries" }).click();
  await page.getByLabel("Amount (USD)").fill("55.25");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByText("−$55.25", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Log transaction", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Paycheck example");
  await page.getByLabel("Amount (USD)").fill("1200");
  await page.getByLabel("Type", { exact: true }).selectOption("income");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(page.getByText("+$1,200.00", { exact: true })).toBeVisible();
  const csv = await page.request.get("/api/export");
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).toContain('"Weekly groceries","55.25"');
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Weekly groceries" }).click();
  await expect(
    page.getByText("Weekly groceries", { exact: true }),
  ).not.toBeVisible();
});
test("AUTH-02/03 admin activation, isolation and immediate disabling", async ({
  page,
  browser,
}) => {
  await login(page);
  const guest = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const r = await guest.request.post("/api/e2e/sign-in", {
    data: { who: "guest" },
  });
  expect(r.ok()).toBe(true);
  const guestId = (await r.json()).user.id;
  await page.request.patch(`/api/admin/users/${guestId}`, {
    data: { disabled: true },
  });
  const guestPage = await guest.newPage();
  await guestPage.goto("/budget");
  await expect(guestPage).toHaveURL(/\/pending$/);
  for (const path of [
    "/api/plan",
    "/api/transactions",
    "/api/checking",
    "/api/export",
  ])
    expect((await guest.request.get(path)).status()).toBe(403);
  await page.goto("/admin");
  const row = page
    .locator(".admin-row")
    .filter({ hasText: "guest@budget.test" });
  await row.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await guestPage.getByRole("link", { name: "Check access again" }).click();
  await expect(
    guestPage.getByRole("heading", { name: "Know where your money stands." }),
  ).toBeVisible();
  const gp = await (await guest.request.get("/api/plan")).json();
  expect(gp.plan.income.pay).toBe(0);
  expect(
    (
      await guest.request.patch(`/api/admin/users/${guestId}`, {
        data: { disabled: false },
      })
    ).status(),
  ).toBe(403);
  const posted = await page.request.post("/api/transactions", {
    data: {
      date: today(),
      kind: "expense",
      categoryId: "category-0",
      description: "Owner-only row",
      amountCents: 1234,
    },
  });
  const tx = await posted.json();
  expect(
    (
      await guest.request.delete(`/api/transactions/${tx.id}`, {
        data: { expected: tx },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await guest.request.patch(`/api/transactions/${tx.id}`, {
        data: {
          date: today(),
          kind: "expense",
          categoryId: "category-0",
          description: "Intruder",
          expected: tx,
          amountCents: 10,
        },
      })
    ).status(),
  ).toBe(404);
  expect(await (await guest.request.get("/api/export")).text()).not.toContain(
    "Owner-only row",
  );
  const owner = await (await page.request.get("/api/auth/get-session")).json();
  expect(
    (
      await page.request.patch(`/api/admin/users/${owner.user.id}`, {
        data: { disabled: true },
      })
    ).status(),
  ).toBe(400);
  await row.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(row.getByText("Pending / disabled")).toBeVisible();
  expect((await guest.request.get("/api/plan")).status()).toBe(403);
  expect(
    (await guest.request.post("/api/transactions", { data: {} })).status(),
  ).toBe(403);
  expect((await guest.request.put("/api/plan", { data: gp })).status()).toBe(
    403,
  );
  expect((await guest.request.get("/api/export")).status()).toBe(403);
  expect((await guest.request.get("/api/checking")).status()).toBe(403);
  expect(
    (await guest.request.put("/api/checking", { data: {} })).status(),
  ).toBe(403);
  expect(
    (
      await guest.request.post("/api/transactions/import", { data: {} })
    ).status(),
  ).toBe(403);
  await guest.close();
});
test("FORECAST-01 and UI-01 all views, dark mode, reduced motion and mobile fit", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const view of [
    "Your plan",
    "Checking",
    "Looking ahead",
    "Plan settings",
  ]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "Know where your money stands." }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `.local/${testInfo.project.name}-checking.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Looking ahead", exact: true })
    .click();
  await expect(page.getByRole("img", { name: /Debt balances/ })).toBeVisible();
  await page.screenshot({
    path: `.local/${testInfo.project.name}-forecast.png`,
    fullPage: true,
  });
});
test("IMPORT-01 preview and save a JSON plan without overwriting automatically", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Plan settings", exact: true })
    .click();
  const p = demoPlan();
  p.name = "Imported example";
  p.income.pay = 3500;
  await page.getByLabel("Import budget file").setInputFiles({
    name: "plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("button", { name: "Use this plan", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/plan")).json()).plan.income.pay,
  ).toBe(2800);
  await page
    .getByRole("button", { name: "Use this plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
  await expect(page.getByLabel("Take-home pay", { exact: true })).toHaveValue(
    "3500",
  );
});

test("PLAN-03 edits made during a save remain dirty without an all-saved confirmation", async ({
  page,
}) => {
  await login(page);
  const input = page.getByLabel("Take-home pay", { exact: true });
  await input.fill("3100");
  await input.blur();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    await expect(
      page.getByText("Saving your plan…", { exact: true }),
    ).toBeVisible();
    await input.fill("3200");
    await input.blur();
  } finally {
    release();
  }
  await expect(
    page.getByText("You have unsaved changes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).not.toBeVisible();
  expect(
    (await (await page.request.get("/api/plan")).json()).plan.income.pay,
  ).toBe(3100);
  await expect(input).toHaveValue("3200");
  await page.unroute("**/api/plan");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Your plan", exact: true }).click();
  await expect(input).toHaveValue("3200");
});
