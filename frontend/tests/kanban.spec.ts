import { expect, test, type Page } from "@playwright/test";
import type { BoardData } from "../src/lib/kanban";

const createBoard = (): BoardData => ({
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "Draft quarterly themes." },
    "card-2": { id: "card-2", title: "Gather customer signals", details: "Review customer feedback." },
    "card-3": { id: "card-3", title: "Prototype analytics view", details: "Sketch the dashboard." },
    "card-4": { id: "card-4", title: "Refine status language", details: "Standardize column labels." },
    "card-5": { id: "card-5", title: "Design card layout", details: "Improve scanning." },
    "card-6": { id: "card-6", title: "QA micro-interactions", details: "Verify loading states." },
    "card-7": { id: "card-7", title: "Ship marketing page", details: "Copy approved." },
    "card-8": { id: "card-8", title: "Close onboarding sprint", details: "Document release notes." },
  },
});

const openBoard = async (
  page: Page,
  options: { failCardCreate?: boolean } = {}
) => {
  const board = createBoard();
  let nextCardId = 100;
  const renameRequests: string[] = [];

  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "e2e-token", token_type: "bearer" }),
    })
  );
  await page.route("**/api/board", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(board),
    })
  );
  await page.route("**/api/cards", async (route) => {
    if (options.failCardCreate) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Card could not be saved." }),
      });
      return;
    }
    const payload = route.request().postDataJSON() as {
      column_id: string;
      title: string;
      details: string;
    };
    const id = `e2e-card-${nextCardId++}`;
    board.cards[id] = { id, title: payload.title, details: payload.details };
    board.columns
      .find((column) => column.id === payload.column_id)
      ?.cardIds.push(id);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(board.cards[id]),
    });
  });
  await page.route("**/api/cards/*/move", async (route) => {
    const cardId = route.request().url().split("/api/cards/")[1]?.split("/")[0];
    const payload = route.request().postDataJSON() as {
      column_id: string;
      position: number;
    };
    const source = board.columns.find((column) => column.cardIds.includes(cardId ?? ""));
    const target = board.columns.find((column) => column.id === payload.column_id);
    if (source && target && cardId) {
      source.cardIds = source.cardIds.filter((id) => id !== cardId);
      target.cardIds.splice(payload.position, 0, cardId);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/cards\/[^/]+$/, async (route) => {
    const cardId = route.request().url().split("/").at(-1);
    if (route.request().method() === "PATCH" && cardId) {
      const payload = route.request().postDataJSON() as { title: string; details: string };
      board.cards[cardId] = { id: cardId, ...payload };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board.cards[cardId]),
      });
      return;
    }
    if (cardId) {
      delete board.cards[cardId];
      for (const column of board.columns) {
        column.cardIds = column.cardIds.filter((id) => id !== cardId);
      }
    }
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/columns/*", async (route) => {
    const columnId = route.request().url().split("/").at(-1);
    const payload = route.request().postDataJSON() as { title: string };
    renameRequests.push(payload.title);
    const column = board.columns.find((item) => item.id === columnId);
    if (column) {
      column.title = payload.title;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: columnId, title: payload.title }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  return { renameRequests };
};

test("loads the authenticated kanban board", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await openBoard(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
  await page.reload();
  await expect(
    page.locator('[data-testid^="column-"]').first().getByText("Playwright card")
  ).toBeVisible();
});

test("edits a card", async ({ page }) => {
  await openBoard(page);
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await card.getByLabel("Card title").fill("Align product roadmap");
  await card.getByLabel("Card details").fill("Agree themes with leads.");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Align product roadmap")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("card-card-1")).toContainText("Agree themes with leads.");
});

test("renames a column with fast typing in a single save", async ({ page }) => {
  const { renameRequests } = await openBoard(page);
  const title = page.getByTestId("column-col-backlog").getByLabel("Column title");
  await title.fill("");
  await title.pressSequentially("Ideas and backlog", { delay: 5 });
  await title.press("Enter");
  await expect(title).toHaveValue("Ideas and backlog");
  expect(renameRequests).toEqual(["Ideas and backlog"]);
  await page.reload();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Ideas and backlog");
});

test("surfaces card save errors without hiding the board", async ({ page }) => {
  await openBoard(page, { failCardCreate: true });
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Unsent card");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  await expect(page.locator("p[role='alert']")).toHaveText(
    "Card could not be saved."
  );
  await expect(page.getByText("Align roadmap themes")).toBeVisible();
  await expect(page.getByText("Unsent card")).toHaveCount(0);
});

test("moves a card between columns", async ({ page }) => {
  await openBoard(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-1")
  ).toBeVisible();
});
