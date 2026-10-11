import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addMonths, demoPlan, today } from "../lib/budget";
import type { Transaction } from "../lib/store";

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const dayOffset = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
type Row = {
  row: number;
  date: string;
  kind: "income" | "expense";
  categoryId: string;
  description: string;
  amountCents: number;
};
type Preview = {
  duplicates: { row: number; incoming: Row; matches: Transaction[] }[];
  newCount: number;
  reviewToken: string;
};

async function signIn(request: APIRequestContext, who = "owner") {
  const response = await request.post("/api/e2e/sign-in", { data: { who } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).user.id as string;
}
async function reset(request: APIRequestContext) {
  const current = await (await request.get("/api/plan")).json();
  const saved = await request.put("/api/plan", {
    data: { plan: demoPlan(), revision: current.revision },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const transactions: Transaction[] = await (
    await request.get("/api/transactions")
  ).json();
  for (const transaction of transactions)
    expect(
      (
        await request.delete(`/api/transactions/${transaction.id}`, {
          data: { expected: transaction },
        })
      ).ok(),
    ).toBe(true);
  const checking = await (await request.get("/api/checking")).json();
  const savedBalance = await request.put("/api/checking", {
    data: {
      asOf: today(),
      balanceCents: 0,
      revision: checking?.revision ?? null,
    },
  });
  expect(savedBalance.ok(), await savedBalance.text()).toBe(true);
}
async function setup(page: Page) {
  await signIn(page.request);
  await reset(page.request);
}
async function add(request: APIRequestContext, values: Partial<Row>) {
  const response = await request.post("/api/transactions", {
    data: {
      date: today(),
      kind: "expense",
      categoryId: "category-0",
      description: "Fictional transaction",
      amountCents: 2500,
      ...values,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).id as string;
}
async function preview(request: APIRequestContext, rows: Row[]) {
  const response = await request.post("/api/transactions/import", {
    data: { rows },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Preview;
}
function checking(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Checking balance", exact: true }),
  });
}
function transactionRow(page: Page, description: string) {
  return page.locator(".transaction-row").filter({
    has: page.getByText(description, { exact: true }),
  });
}
async function accessibleAndFits(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const modal = page.getByRole("dialog");
  if (await modal.count()) {
    const bounds = await modal.boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(bounds).not.toBeNull();
    // A usable modal has room around it and keeps its actions on screen.
    expect(bounds!.x).toBeGreaterThanOrEqual(8);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(
      Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2),
    ).toBeLessThanOrEqual(1);
    expect(
      await modal.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
      ),
    ).toBeGreaterThanOrEqual(12);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}
async function upload(page: Page, csv: string) {
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.getByLabel("Choose CSV file", { exact: true }).setInputFiles({
    name: "fictional-bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByRole("heading", { name: "Map columns", exact: true }),
  ).toBeVisible();
}

test("LEDGER-05 search, filters, bulk category badges and undo preserve balances", async ({
  page,
}, testInfo) => {
  await setup(page);
  await add(page.request, {
    description: "North Market weekly shop",
    categoryId: "uncategorized",
    amountCents: 4825,
  });
  await add(page.request, {
    description: "North Market earlier shop",
    categoryId: "uncategorized",
    date: dayOffset(today(), -40),
    amountCents: 3600,
  });
  await add(page.request, {
    description: "Fictional fuel",
    categoryId: "category-2",
    amountCents: 1500,
  });
  await add(page.request, {
    description: "North Market refund",
    kind: "income",
    categoryId: "income",
    amountCents: 1000,
  });
  await page.goto("/budget");
  const balanceBefore = await checking(page).innerText();
  await expect(
    page.getByRole("button", { name: "Uncategorized · 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search transactions", exact: true })
    .fill("SHOP mark");
  await expect(page.locator(".transaction-row")).toHaveCount(2);
  await expect(page.locator(".transaction-description mark")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Uncategorized · 2", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Select all 2 matching expenses",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Spending category", exact: true }),
  ).toBeFocused();
  await accessibleAndFits(page);
  await page
    .getByRole("combobox", { name: "Spending category", exact: true })
    .selectOption("category-0");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("2 transactions assigned to Groceries.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No matching transactions.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search transactions", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Remove category filter", exact: true })
    .click();
  await expect(
    page.locator(".category-badge").filter({ hasText: "Groceries" }),
  ).toHaveCount(2);
  await expect(page.locator(".transaction-updated")).toHaveCount(2);
  expect(await checking(page).innerText()).toBe(balanceBefore);
  await accessibleAndFits(page);
  await page.screenshot({
    path: `.local/categories-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Undo category change", exact: true })
    .click();
  await expect(
    page.locator(".category-badge").filter({ hasText: "Uncategorized" }),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Uncategorized · 2", exact: true }),
  ).toBeVisible();
  expect(await checking(page).innerText()).toBe(balanceBefore);

  // Filters combine, and changing them clears selections rather than editing hidden rows.
  await page
    .getByRole("checkbox", { name: "Select Fictional fuel", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "Category filter", exact: true })
    .selectOption("category-2");
  await expect(
    page.getByRole("button", { name: "Assign category", exact: true }),
  ).not.toBeVisible();
  await page.getByText("Dates and amounts", { exact: true }).click();
  await page.getByLabel("From date", { exact: true }).fill(today());
  await page.getByLabel("Through date", { exact: true }).fill(today());
  await page.getByLabel("Minimum amount (USD)", { exact: true }).fill("15");
  await page.getByLabel("Maximum amount (USD)", { exact: true }).fill("15");
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await accessibleAndFits(page);
  await page.getByLabel("Maximum amount (USD)", { exact: true }).fill("14.99");
  await expect(
    page.getByRole("heading", {
      name: "No matching transactions.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show all transactions", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Transaction type", exact: true })
    .selectOption("income");
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: /^Select/ })).toHaveCount(0);
});

test("LEDGER-05 quick category picker supports keyboard, mixed selections and historical undo", async ({
  page,
}) => {
  await setup(page);
  const firstId = await add(page.request, { description: "Historical market" });
  await add(page.request, {
    description: "Fictional cafe",
    categoryId: "category-1",
  });
  const savedPlan = await (await page.request.get("/api/plan")).json();
  savedPlan.plan.categories.shift();
  expect((await page.request.put("/api/plan", { data: savedPlan })).ok()).toBe(
    true,
  );
  await page.goto("/budget");
  const badge = page.getByRole("button", {
    name: "Change category for Historical market, current category Groceries",
    exact: true,
  });
  await badge.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Spending category", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(badge).toBeFocused();
  await page
    .getByRole("checkbox", {
      name: "Select all 2 matching expenses",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(page.getByText(/Multiple current categories/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "Spending category", exact: true })
    .selectOption("category-1");
  await expect(
    page.getByText("1 already in this category.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(
    page.getByText("1 transaction assigned to Eating out.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Undo category change", exact: true })
    .click();
  await expect(badge).toBeVisible();
  const rows: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  expect(rows.find((row) => row.id === firstId)).toMatchObject({
    categoryId: "category-0",
    categoryName: "Groceries",
  });
  await accessibleAndFits(page);
});

test("LEDGER-05 undo and filters stay accurate after no-op picks, edits and renames", async ({
  page,
}) => {
  await setup(page);
  await add(page.request, { description: "Fictional market run" });
  await add(page.request, {
    description: "Fictional cafe",
    categoryId: "uncategorized",
  });
  const savedPlan = await (await page.request.get("/api/plan")).json();
  savedPlan.plan.categories.shift();
  expect((await page.request.put("/api/plan", { data: savedPlan })).ok()).toBe(
    true,
  );
  await page.goto("/budget");
  const search = page.getByRole("searchbox", {
    name: "Search transactions",
    exact: true,
  });
  await search.fill("mark market");
  await expect(page.locator(".transaction-description mark")).toHaveText([
    "market",
  ]);
  await search.fill("");
  const categoryFilter = page.getByRole("combobox", {
    name: "Category filter",
    exact: true,
  });
  await categoryFilter.selectOption("category-0");

  // The server's current name is reported, even when this tab's plan is stale.
  const renamed = await (await page.request.get("/api/plan")).json();
  renamed.plan.categories.find(
    (category: { id: string }) => category.id === "category-1",
  ).name = "Fictional dining";
  expect((await page.request.put("/api/plan", { data: renamed })).ok()).toBe(
    true,
  );
  await page
    .getByRole("button", { name: /^Change category for Fictional market run/ })
    .click();
  await page
    .getByRole("combobox", { name: "Spending category", exact: true })
    .selectOption("category-1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(
    page.getByText("1 transaction assigned to Fictional dining.", {
      exact: true,
    }),
  ).toBeVisible();
  // Reassigning every row out of a previous category keeps the filter visible.
  await expect(categoryFilter).toHaveValue("category-0");
  await page
    .getByRole("button", { name: "Clear search and filters", exact: true })
    .click();

  // Choosing a current category is a no-op and keeps the earlier Undo.
  const undo = page.getByRole("button", {
    name: "Undo category change",
    exact: true,
  });
  await page
    .getByRole("button", { name: /^Change category for Fictional market run/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(
    page.getByText("These expenses are already in that category.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(undo).toBeVisible();

  // Editing an undoable row in this tab withdraws Undo instead of offering a 409.
  await page
    .getByRole("button", { name: "Edit Fictional market run", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Description", { exact: true })
    .fill("Fictional market trip");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(undo).not.toBeVisible();

  // A rejected Undo is withdrawn rather than left to fail repeatedly.
  await page
    .getByRole("button", { name: /^Change category for Fictional cafe/ })
    .click();
  await page
    .getByRole("combobox", { name: "Spending category", exact: true })
    .selectOption("category-1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(undo).toBeVisible();
  const rows: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  const cafe = rows.find((row) => row.description === "Fictional cafe")!;
  expect(
    (
      await page.request.patch(`/api/transactions/${cafe.id}`, {
        data: { ...cafe, amountCents: 1234, expected: cafe },
      })
    ).ok(),
  ).toBe(true);
  await undo.click();
  await expect(
    page.locator(".error-text").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(undo).not.toBeVisible();
  await accessibleAndFits(page);
});

test("LEDGER-06 undo receipts reject rows that changed and returned, and replays", async ({
  page,
}) => {
  await setup(page);
  await add(page.request, {
    description: "Fictional repeat purchase",
    categoryId: "uncategorized",
  });
  const current = async () =>
    (
      (await (
        await page.request.get("/api/transactions")
      ).json()) as Transaction[]
    )[0];
  const assign = async (categoryId: string) => {
    const row = await current();
    const response = await page.request.patch("/api/transactions/categories", {
      data: { categoryId, transactions: [{ id: row.id, expected: row }] },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).undoToken as string;
  };
  const undo = (undoToken: string) =>
    page.request.post("/api/transactions/categories", {
      data: { undoToken },
    });
  const first = await assign("category-0");
  await assign("category-1");
  const latest = await assign("category-0");
  const beforeUndo = await current();
  // The row has the same values as after the first assignment, but newer writes.
  expect((await undo(first)).status()).toBe(409);
  expect(await current()).toEqual(beforeUndo);
  expect((await undo(latest)).ok()).toBe(true);
  expect(await current()).toMatchObject({ categoryId: "category-1" });
  await assign("category-0");
  const redone = await current();
  // A receipt is single-use, even after the same assignment is made again.
  expect((await undo(latest)).status()).toBe(409);
  expect(await current()).toEqual(redone);
});

test("LEDGER-06 bulk categories reject stale batches and undo without partial writes", async ({
  page,
}) => {
  await setup(page);
  await add(page.request, {
    description: "First fictional purchase",
    categoryId: "uncategorized",
  });
  await add(page.request, {
    description: "Second fictional purchase",
    categoryId: "uncategorized",
  });
  const original: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  const batch = {
    categoryId: "category-0",
    transactions: original.map((row) => ({ id: row.id, expected: row })),
  };
  const responses = await Promise.all([
    page.request.patch("/api/transactions/categories", { data: batch }),
    page.request.patch(`/api/transactions/${original[0].id}`, {
      data: {
        ...original[0],
        description: "Newer details",
        expected: original[0],
      },
    }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  let latest: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  if (responses[0].status() === 409) {
    expect(latest.every((row) => row.categoryId === "uncategorized")).toBe(
      true,
    );
    const assigned = await page.request.patch("/api/transactions/categories", {
      data: {
        ...batch,
        transactions: latest.map((row) => ({ id: row.id, expected: row })),
      },
    });
    expect(assigned.ok(), await assigned.text()).toBe(true);
    responses[0] = assigned;
  } else
    expect(latest.every((row) => row.categoryId === "category-0")).toBe(true);
  const { undoToken } = await responses[0].json();
  latest = await (await page.request.get("/api/transactions")).json();
  const edited = await page.request.patch(`/api/transactions/${latest[0].id}`, {
    data: { ...latest[0], amountCents: 9876, expected: latest[0] },
  });
  expect(edited.ok()).toBe(true);
  const beforeUndo = await (await page.request.get("/api/transactions")).json();
  expect(
    (
      await page.request.post("/api/transactions/categories", {
        data: { undoToken },
      })
    ).status(),
  ).toBe(409);
  expect(await (await page.request.get("/api/transactions")).json()).toEqual(
    beforeUndo,
  );
  expect(
    (
      await page.request.patch("/api/transactions/categories", { data: batch })
    ).status(),
  ).toBe(409);
  expect(await (await page.request.get("/api/transactions")).json()).toEqual(
    beforeUndo,
  );
});

test("LEDGER-06 bulk categories enforce ownership, access, origin and input bounds", async ({
  page,
  browser,
}) => {
  await setup(page);
  await add(page.request, { description: "Owner fictional expense" });
  const rows: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  const data = {
    categoryId: "category-1",
    transactions: rows.map((row) => ({ id: row.id, expected: row })),
  };
  expect(
    (
      await page.request.patch("/api/transactions/categories", {
        data,
        headers: { Origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  for (const change of [
    { categoryId: "missing-category" },
    { categoryId: "income" },
    { transactions: [] },
    { transactions: [...data.transactions, ...data.transactions] },
    { transactions: [{ ...data.transactions[0], id: "invalid" }] },
    { transactions: Array.from({ length: 201 }, () => data.transactions[0]) },
  ])
    expect(
      (
        await page.request.patch("/api/transactions/categories", {
          data: { ...data, ...change },
        })
      ).status(),
    ).toBe(400);
  const incomeId = await add(page.request, {
    description: "Fictional income",
    kind: "income",
    categoryId: "income",
  });
  const income: Transaction = (
    await (await page.request.get("/api/transactions")).json()
  ).find((row: Transaction) => row.id === incomeId);
  expect(
    (
      await page.request.patch("/api/transactions/categories", {
        data: {
          ...data,
          transactions: [
            ...data.transactions,
            { id: incomeId, expected: income },
          ],
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/transactions/categories", {
        data: { undoToken: "forged.receipt" },
      })
    ).status(),
  ).toBe(400);
  const assigned = await page.request.patch("/api/transactions/categories", {
    data,
  });
  expect(assigned.ok()).toBe(true);
  const { undoToken } = await assigned.json();
  const other = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  try {
    expect(
      (
        await other.request.patch("/api/transactions/categories", { data })
      ).status(),
    ).toBe(401);
    const userId = await signIn(other.request, "other");
    expect(
      (
        await page.request.patch(`/api/admin/users/${userId}`, {
          data: { disabled: true },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await other.request.patch("/api/transactions/categories", { data })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`/api/admin/users/${userId}`, {
          data: { disabled: false },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await other.request.patch("/api/transactions/categories", { data })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post("/api/transactions/categories", {
          data: { undoToken },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch(`/api/admin/users/${userId}`, {
          data: { disabled: true },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await other.request.post("/api/transactions/categories", {
          data: { undoToken },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/transactions/categories", {
          data: { undoToken },
          headers: { Origin: "https://evil.example" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await other.close();
  }
});

test("LEDGER-06 CSV updates invalidate category selections and undo atomically", async ({
  page,
}) => {
  await setup(page);
  const firstId = await add(page.request, {
    description: "Fictional market",
    categoryId: "uncategorized",
    amountCents: 1200,
  });
  await add(page.request, {
    description: "Fictional cafe",
    categoryId: "uncategorized",
    amountCents: 2500,
  });
  const original: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  async function importCorrection(description: string) {
    const rows: Row[] = [
      {
        row: 2,
        date: today(),
        kind: "expense",
        categoryId: "category-0",
        description,
        amountCents: 1200,
      },
    ];
    const review = await preview(page.request, rows);
    const result = await page.request.post("/api/transactions/import", {
      data: {
        rows,
        commit: true,
        reviewToken: review.reviewToken,
        decisions: [
          {
            row: 2,
            action: "update",
            targetId: firstId,
            expected: review.duplicates[0].matches.find(
              (row) => row.id === firstId,
            ),
          },
        ],
      },
    });
    expect(result.ok(), await result.text()).toBe(true);
  }
  await page.goto("/budget");
  await page
    .getByRole("checkbox", {
      name: "Select all 2 matching expenses",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Spending category", exact: true })
    .selectOption("category-1");
  await importCorrection("CSV correction");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Assign category", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Spending category", exact: true }),
  ).toHaveValue("category-1");
  await accessibleAndFits(page);
  const afterImport: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  expect(afterImport.find((row) => row.id !== firstId)).toEqual(
    original.find((row) => row.id !== firstId),
  );
  await page
    .getByRole("button", { name: "Close category picker", exact: true })
    .click();
  const assigned = await page.request.patch("/api/transactions/categories", {
    data: {
      categoryId: "category-1",
      transactions: afterImport.map((row) => ({ id: row.id, expected: row })),
    },
  });
  expect(assigned.ok()).toBe(true);
  const { undoToken } = await assigned.json();
  await importCorrection("Later CSV correction");
  const beforeUndo = await (await page.request.get("/api/transactions")).json();
  expect(
    (
      await page.request.post("/api/transactions/categories", {
        data: { undoToken },
      })
    ).status(),
  ).toBe(409);
  expect(await (await page.request.get("/api/transactions")).json()).toEqual(
    beforeUndo,
  );
});

test("CHECKING-01 bank reconciliation and transaction CRUD recalculate today's balance", async ({
  page,
}, testInfo) => {
  await setup(page);
  await add(page.request, { description: "Already entered today" });
  await page.goto("/budget");
  await expect(
    page.getByRole("heading", { name: "Checking balance", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Update balance", exact: true })
    .click();
  await page.getByLabel("Balance (USD)", { exact: true }).fill("1500");
  await page.getByLabel("Balance date", { exact: true }).fill(today());
  await page.getByRole("button", { name: "Save balance", exact: true }).click();
  await expect(checking(page)).toContainText("$1,500.00");
  const checkpoint = await (await page.request.get("/api/checking")).json();
  expect(checkpoint.balanceCents).toBe(152500);
  expect(checkpoint.asOf).toBe(today());

  await page
    .getByRole("button", { name: "Log transaction", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Fictional groceries");
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48.25");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(checking(page)).toContainText("$1,451.75");
  await expect(transactionRow(page, "Fictional groceries")).toContainText(
    "$1,451.75",
  );
  await page
    .getByRole("button", { name: "Edit Fictional groceries", exact: true })
    .click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("55.25");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(checking(page)).toContainText("$1,444.75");
  await page.reload();
  await expect(checking(page)).toContainText("$1,444.75");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Fictional groceries", exact: true })
    .click();
  await expect(checking(page)).toContainText("$1,500.00");
  await expect(
    page.getByText("Fictional groceries", { exact: true }),
  ).not.toBeVisible();

  await page
    .getByRole("button", { name: "Log transaction", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Fictional paycheck");
  await page.getByLabel("Amount (USD)", { exact: true }).fill("1200");
  await page.getByLabel("Type", { exact: true }).selectOption("income");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(checking(page)).toContainText("$2,700.00");
  await accessibleAndFits(page);
  await page.screenshot({
    path: `.local/checking-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("CHECKING-02 prior history, future entries and month filters preserve the full running balance", async ({
  page,
}) => {
  await setup(page);
  const month = today().slice(0, 7);
  const previousMonth = addMonths(month, -1);
  const asOf = `${previousMonth}-01`;
  const checkpoint = await (await page.request.get("/api/checking")).json();
  expect(
    (
      await page.request.put("/api/checking", {
        data: { asOf, balanceCents: 100000, revision: checkpoint.revision },
      })
    ).ok(),
  ).toBe(true);
  await add(page.request, {
    date: dayOffset(asOf, -1),
    description: "History before balance",
    amountCents: 900000,
  });
  await add(page.request, {
    date: `${previousMonth}-15`,
    description: "Previous month expense",
    amountCents: 10000,
  });
  await add(page.request, {
    date: today(),
    description: "Current month expense",
    amountCents: 2500,
  });
  await add(page.request, {
    date: dayOffset(today(), 1),
    description: "Future scheduled expense",
    amountCents: 7500,
  });
  await page.goto("/budget");
  await expect(checking(page)).toContainText("$875.00");
  await expect(transactionRow(page, "Current month expense")).toContainText(
    "$875.00",
  );
  await page.getByLabel("Viewing month", { exact: true }).fill(previousMonth);
  await expect(transactionRow(page, "Previous month expense")).toContainText(
    "$900.00",
  );
  await expect(checking(page)).toContainText("$875.00");
  await page
    .getByLabel("Viewing month", { exact: true })
    .fill(dayOffset(asOf, -1).slice(0, 7));
  await expect(transactionRow(page, "History before balance")).toContainText(
    "Before starting balance",
  );
  await expect(checking(page)).toContainText("$875.00");
  await page
    .getByLabel("Viewing month", { exact: true })
    .fill(dayOffset(today(), 1).slice(0, 7));
  await expect(transactionRow(page, "Future scheduled expense")).toContainText(
    "Scheduled",
  );
  await expect(checking(page)).toContainText("$875.00");
});

test("IMPORT-02 stale duplicate review fails atomically and reimport can skip all matches", async ({
  page,
}) => {
  await setup(page);
  const id = await add(page.request, {
    description: "Manual record",
    amountCents: 4500,
  });
  const rows: Row[] = [
    {
      row: 2,
      date: today(),
      kind: "expense",
      categoryId: "category-0",
      description: "Imported replacement",
      amountCents: 4500,
    },
    {
      row: 3,
      date: today(),
      kind: "income",
      categoryId: "income",
      description: "New imported deposit",
      amountCents: 33300,
    },
  ];
  const first = await preview(page.request, rows);
  expect(first.newCount).toBe(1);
  expect(first.duplicates).toHaveLength(1);
  expect(first.duplicates[0].matches[0].id).toBe(id);
  expect(
    await (await page.request.get("/api/transactions")).json(),
  ).toHaveLength(1);
  const edited = await page.request.patch(`/api/transactions/${id}`, {
    data: {
      ...rows[0],
      description: "Changed in another tab",
      expected: first.duplicates[0].matches[0],
    },
  });
  expect(edited.ok()).toBe(true);
  const stale = await page.request.post("/api/transactions/import", {
    data: {
      rows,
      commit: true,
      reviewToken: first.reviewToken,
      decisions: [
        {
          row: 2,
          action: "update",
          targetId: id,
          expected: first.duplicates[0].matches[0],
        },
      ],
    },
  });
  expect(stale.status()).toBe(409);
  expect(await (await page.request.get("/api/transactions")).json()).toEqual([
    expect.objectContaining({ id, description: "Changed in another tab" }),
  ]);

  const fresh = await preview(page.request, rows);
  const committed = await page.request.post("/api/transactions/import", {
    data: {
      rows,
      commit: true,
      reviewToken: fresh.reviewToken,
      decisions: [
        {
          row: 2,
          action: "update",
          targetId: id,
          expected: fresh.duplicates[0].matches[0],
        },
      ],
    },
  });
  expect(committed.ok(), await committed.text()).toBe(true);
  expect(await committed.json()).toMatchObject({
    added: 1,
    updated: 1,
    skipped: 0,
  });
  const repeated = await preview(page.request, rows);
  expect(repeated.duplicates).toHaveLength(2);
  expect(repeated.newCount).toBe(0);
  const skipped = await page.request.post("/api/transactions/import", {
    data: {
      rows,
      commit: true,
      reviewToken: repeated.reviewToken,
      decisions: repeated.duplicates.map((duplicate) => ({
        row: duplicate.row,
        action: "skip",
      })),
    },
  });
  expect(skipped.ok(), await skipped.text()).toBe(true);
  expect(await skipped.json()).toMatchObject({
    added: 0,
    updated: 0,
    skipped: 2,
  });
  expect(
    await (await page.request.get("/api/transactions")).json(),
  ).toHaveLength(2);
});

test("CHECKING-03/IMPORT-03 revisions, origins and ownership protect financial writes", async ({
  page,
  browser,
}) => {
  await setup(page);
  const checkpoint = await (await page.request.get("/api/checking")).json();
  const value = {
    asOf: today(),
    balanceCents: 123456,
    revision: checkpoint.revision,
  };
  expect((await page.request.put("/api/checking", { data: value })).ok()).toBe(
    true,
  );
  expect(
    (await page.request.put("/api/checking", { data: value })).status(),
  ).toBe(409);
  const current = await (await page.request.get("/api/checking")).json();
  expect(
    (
      await page.request.put("/api/checking", {
        data: { ...current, asOf: dayOffset(today(), 1) },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.put("/api/checking", {
        data: current,
        headers: { Origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  const row: Row = {
    row: 2,
    date: today(),
    kind: "expense",
    categoryId: "category-0",
    description: "Owner private import",
    amountCents: 4200,
  };
  const ownerId = await add(page.request, row);
  expect(
    (
      await page.request.post("/api/transactions/import", {
        data: { rows: [row] },
        headers: { Origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);

  const other = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  try {
    const userId = await signIn(other.request, "other");
    expect(
      (
        await page.request.patch(`/api/admin/users/${userId}`, {
          data: { disabled: false },
        })
      ).ok(),
    ).toBe(true);
    await reset(other.request);
    const otherChecking = await (
      await other.request.get("/api/checking")
    ).json();
    expect(otherChecking.balanceCents).toBe(0);
    const otherRows = await preview(other.request, [row]);
    expect(otherRows.newCount).toBe(1);
    expect(otherRows.duplicates).toEqual([]);
    await add(other.request, { ...row, description: "Other user's record" });
    const otherPreview = await preview(other.request, [row]);
    expect(otherPreview.duplicates[0].matches).toHaveLength(1);
    expect(otherPreview.duplicates[0].matches[0].id).not.toBe(ownerId);
    const stolen = await other.request.post("/api/transactions/import", {
      data: {
        rows: [row],
        commit: true,
        reviewToken: otherPreview.reviewToken,
        decisions: [
          {
            row: 2,
            action: "update",
            targetId: ownerId,
            expected: otherPreview.duplicates[0].matches[0],
          },
        ],
      },
    });
    expect(stolen.status()).toBe(409);
    expect(await (await other.request.get("/api/transactions")).json()).toEqual(
      [expect.objectContaining({ description: "Other user's record" })],
    );
    expect(await (await page.request.get("/api/transactions")).json()).toEqual([
      expect.objectContaining({
        id: ownerId,
        description: "Owner private import",
      }),
    ]);
    expect(
      (await (await page.request.get("/api/checking")).json()).balanceCents,
    ).toBe(123456);
  } finally {
    await other.close();
  }
});

test("IMPORT-04 mapped CSV dates, invalid rows and per-row/apply-remaining duplicate choices", async ({
  page,
}, testInfo) => {
  await setup(page);
  await add(page.request, {
    description: "Manual groceries",
    amountCents: 4825,
  });
  await add(page.request, { description: "Manual coffee", amountCents: 1200 });
  await add(page.request, { description: "Manual fuel", amountCents: 2000 });
  await page.goto("/budget");
  const date = today().split("-").reverse().join("/");
  const csv = [
    "Fictional bank export",
    "Booked,Note,Delta,Bucket",
    `${date},Bank groceries,-48.25,Groceries`,
    `${date},Bank coffee,-12.00,Eating out`,
    `${date},Bank refund,95.00,Income`,
    `${date},Bank fuel,-20.00,Fuel`,
    "not-a-date,Broken row,-1.25,Groceries",
  ].join("\n");
  await upload(page, csv);
  await page.getByLabel("Header row number", { exact: true }).fill("2");
  await expect(page.getByLabel("Date column", { exact: true })).toHaveValue(
    "-1",
  );
  await expect(
    page.getByLabel("Description column", { exact: true }),
  ).toHaveValue("-1");
  await expect(page.getByLabel("Amount column", { exact: true })).toHaveValue(
    "-1",
  );
  await page.getByLabel("Date column", { exact: true }).selectOption("0");
  await page
    .getByLabel("Description column", { exact: true })
    .selectOption("1");
  await page.getByLabel("Amount column", { exact: true }).selectOption("2");
  await page.getByLabel("Category column", { exact: true }).selectOption("3");
  await page
    .getByLabel("Category for Groceries", { exact: true })
    .selectOption("category-0");
  await page
    .getByLabel("Category for Eating out", { exact: true })
    .selectOption("category-1");
  await page
    .getByLabel("Category for Fuel", { exact: true })
    .selectOption("category-2");
  await page
    .getByRole("combobox", { name: "Date format", exact: true })
    .selectOption({ label: "DD/MM/YYYY" });
  await accessibleAndFits(page);
  await page.screenshot({
    path: `.local/csv-mapping-${testInfo.project.name}.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: "Review rows", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check for duplicates", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Skip the 1 invalid rows listed above",
      exact: true,
    })
    .check();
  await accessibleAndFits(page);
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resolve duplicates", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Bank groceries", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Manual groceries", exact: true }),
  ).toBeVisible();
  await accessibleAndFits(page);
  await page.screenshot({
    path: `.local/csv-duplicates-${testInfo.project.name}.png`,
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Skip this row", exact: true })
    .click();
  await expect(page.getByText("Bank coffee", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Apply to this and all remaining duplicates",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Update existing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirm import", exact: true }),
  ).toBeVisible();
  await accessibleAndFits(page);
  await page.screenshot({
    path: `.local/${testInfo.project.name}-csv-review.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: /^Import \d+ transactions$/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Import transactions", exact: true }),
  ).not.toBeVisible();
  const transactions: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  expect(transactions).toHaveLength(4);
  expect(transactions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: "Manual groceries",
        amountCents: 4825,
      }),
      expect.objectContaining({
        description: "Bank coffee",
        date: today(),
        categoryId: "category-1",
        kind: "expense",
      }),
      expect.objectContaining({
        description: "Bank fuel",
        categoryId: "category-2",
        kind: "expense",
      }),
      expect.objectContaining({
        description: "Bank refund",
        categoryId: "income",
        kind: "income",
        amountCents: 9500,
      }),
    ]),
  );

  await upload(page, csv);
  await page.getByLabel("Header row number", { exact: true }).fill("2");
  await page.getByLabel("Date column", { exact: true }).selectOption("0");
  await page
    .getByLabel("Description column", { exact: true })
    .selectOption("1");
  await page.getByLabel("Amount column", { exact: true }).selectOption("2");
  await page.getByLabel("Category column", { exact: true }).selectOption("3");
  await page
    .getByLabel("Category for Groceries", { exact: true })
    .selectOption("category-0");
  await page
    .getByLabel("Category for Eating out", { exact: true })
    .selectOption("category-1");
  await page
    .getByLabel("Category for Fuel", { exact: true })
    .selectOption("category-2");
  await page
    .getByRole("combobox", { name: "Date format", exact: true })
    .selectOption({ label: "DD/MM/YYYY" });
  await page.getByRole("button", { name: "Review rows", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Skip the 1 invalid rows listed above",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Apply to this and all remaining duplicates",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Skip this row", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish import", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Import transactions", exact: true }),
  ).not.toBeVisible();
  expect(await (await page.request.get("/api/transactions")).json()).toEqual(
    transactions,
  );
});

test("IMPORT-05 semicolon CSV with separate credit/debit maps quoted descriptions and in-file duplicates", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/budget");
  const csv = [
    "When;Memo;Money in;Money out",
    `${today()};Fictional payroll;1250.50;`,
    `${today()};\"Cafe; lunch\";;-14.25`,
    `${today()};\"Cafe; lunch\";;14.25`,
  ].join("\n");
  await upload(page, csv);
  await page
    .getByRole("combobox", { name: "Separator", exact: true })
    .selectOption(";");
  await page.getByLabel("Date column", { exact: true }).selectOption("0");
  await page
    .getByLabel("Description column", { exact: true })
    .selectOption("1");
  await page
    .getByRole("combobox", { name: "Amount layout", exact: true })
    .selectOption({ label: "Separate credit and debit" });
  await page.getByLabel("Credit column", { exact: true }).selectOption("2");
  await page.getByLabel("Debit column", { exact: true }).selectOption("3");
  await page
    .getByRole("combobox", { name: "Date format", exact: true })
    .selectOption({ label: "YYYY-MM-DD" });
  await page.getByRole("button", { name: "Review rows", exact: true }).click();
  await page
    .getByRole("button", { name: "Check for duplicates", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resolve duplicates", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Skip this row", exact: true })
    .click();
  await page.getByRole("button", { name: /^Import \d+ transactions$/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Import transactions", exact: true }),
  ).not.toBeVisible();
  const transactions: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  expect(transactions).toHaveLength(2);
  expect(transactions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: "Fictional payroll",
        amountCents: 125050,
        kind: "income",
        categoryId: "income",
      }),
      expect.objectContaining({
        description: "Cafe; lunch",
        amountCents: 1425,
        kind: "expense",
      }),
    ]),
  );
  await expect(checking(page)).toContainText("$1,236.25");
});

test("LEDGER-02 editing details preserves a category's historical name after a rename", async ({
  page,
}) => {
  await setup(page);
  const id = await add(page.request, { description: "Historical groceries" });
  const current = await (await page.request.get("/api/plan")).json();
  current.plan.categories[0].name = "Food now";
  expect((await page.request.put("/api/plan", { data: current })).ok()).toBe(
    true,
  );
  const response = await page.request.patch(`/api/transactions/${id}`, {
    data: {
      date: today(),
      kind: "expense",
      categoryId: "category-0",
      description: "Corrected description",
      expected: (await (await page.request.get("/api/transactions")).json())[0],
      amountCents: 3000,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  expect((await response.json()).categoryName).toBe("Groceries");
});

test("LEDGER-02 editing an entry from a removed category does not silently recategorize it", async ({
  page,
}) => {
  await setup(page);
  const id = await add(page.request, { description: "Previous groceries" });
  const current = await (await page.request.get("/api/plan")).json();
  current.plan.categories.shift();
  expect((await page.request.put("/api/plan", { data: current })).ok()).toBe(
    true,
  );
  await page.goto("/budget");
  await page
    .getByRole("button", { name: "Edit Previous groceries", exact: true })
    .click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
    "category-0",
  );
  await page
    .getByLabel("Description", { exact: true })
    .fill("Corrected previous groceries");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const rows: Transaction[] = await (
    await page.request.get("/api/transactions")
  ).json();
  expect(rows.find((row) => row.id === id)).toMatchObject({
    categoryId: "category-0",
    categoryName: "Groceries",
    description: "Corrected previous groceries",
  });
  // An explicit category change still resolves the label from the saved plan.
  await page
    .getByRole("button", {
      name: "Edit Corrected previous groceries",
      exact: true,
    })
    .click();
  await page.getByLabel("Category", { exact: true }).selectOption("category-1");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await (await page.request.get("/api/export")).text()).toContain(
    '"Eating out","Corrected previous groceries"',
  );
});

test("LEDGER-03 malformed UUIDs return not found without database errors", async ({
  page,
}) => {
  await setup(page);
  for (const id of ["a".repeat(36), "-".repeat(36), "not-an-id"]) {
    expect(
      (await page.request.delete(`/api/transactions/${id}`)).status(),
    ).toBe(404);
    expect(
      (
        await page.request.patch(`/api/transactions/${id}`, {
          data: {
            date: today(),
            kind: "income",
            categoryId: "income",
            description: "Invalid ID",
            amountCents: 100,
          },
        })
      ).status(),
    ).toBe(404);
  }
});

test("LEDGER-04 stale edits and deletes cannot overwrite newer transaction details", async ({
  page,
}) => {
  await setup(page);
  const id = await add(page.request, { description: "Original transaction" });
  const original: Transaction = (
    await (await page.request.get("/api/transactions")).json()
  )[0];
  const edited = await page.request.patch(`/api/transactions/${id}`, {
    data: {
      ...original,
      description: "Newer transaction details",
      amountCents: 3700,
      expected: original,
    },
  });
  expect(edited.ok(), await edited.text()).toBe(true);
  const latest = await edited.json();
  const stale = await page.request.patch(`/api/transactions/${id}`, {
    data: { ...original, description: "Stale correction", expected: original },
  });
  expect.soft(stale.status()).toBe(409);
  expect
    .soft(
      (
        await page.request.delete(`/api/transactions/${id}`, {
          data: { expected: original },
        })
      ).status(),
    )
    .toBe(409);
  const persisted = await (await page.request.get("/api/transactions")).json();
  expect.soft(persisted).toEqual([latest]);
  expect(
    (
      await page.request.delete(`/api/transactions/${id}`, {
        data: { expected: latest },
      })
    ).ok(),
  ).toBe(true);
});

test("LEDGER-04 a stale editor keeps the user's correction and reports the conflict", async ({
  page,
}) => {
  await setup(page);
  const id = await add(page.request, { description: "Shared transaction" });
  const original: Transaction = (
    await (await page.request.get("/api/transactions")).json()
  )[0];
  await page.goto("/budget");
  await page
    .getByRole("button", { name: "Edit Shared transaction", exact: true })
    .click();
  const concurrent = await Promise.all(
    ["Concurrent A", "Concurrent B"].map((description) =>
      page.request.patch(`/api/transactions/${id}`, {
        data: { ...original, description, expected: original },
      }),
    ),
  );
  expect(concurrent.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  await page
    .getByLabel("Description", { exact: true })
    .fill("My unsaved correction");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "My unsaved correction",
  );
  await page
    .getByRole("button", { name: "Close transaction form", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Shared transaction", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh transactions", exact: true })
    .click();
  await expect(page.getByText(/^Concurrent [AB]$/)).toBeVisible();
  await expect(
    page.getByText("Shared transaction", { exact: true }),
  ).not.toBeVisible();
});
