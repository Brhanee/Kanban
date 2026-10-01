import { expect, test, type Page } from "@playwright/test";

const board = {
  columns: [
    { id: "todo", title: "Backlog", cardIds: ["card-1"] },
    { id: "discovery", title: "Discovery", cardIds: [] },
    { id: "progress", title: "In Progress", cardIds: [] },
    { id: "review", title: "Review", cardIds: [] },
    { id: "done", title: "Done", cardIds: [] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Seeded card", details: "Existing work" },
  },
};

const updatedBoard = {
  ...board,
  columns: [
    { ...board.columns[0], cardIds: ["card-1", "ai-card"] },
    ...board.columns.slice(1),
  ],
  cards: {
    ...board.cards,
    "ai-card": { id: "ai-card", title: "AI-created card", details: "Next step" },
  },
};

const signIn = async (
  page: Page,
  chatResponse: { status: number; body: object }
) => {
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
  await page.route("**/api/ai/chat", (route) =>
    route.fulfill({
      status: chatResponse.status,
      contentType: "application/json",
      body: JSON.stringify(chatResponse.body),
    })
  );

  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Seeded card")).toBeVisible();
}

test("chat response appears and AI board updates render", async ({ page }) => {
  await signIn(page, {
    status: 200,
    body: {
      response: "I added the next step.",
      actions: [{ operation: "create_card" }],
      board: updatedBoard,
    },
  });

  await page.getByRole("button", { name: "AI Assistant" }).click();
  await page.getByLabel("Message the assistant").fill("Add the next step");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("I added the next step.")).toBeVisible();
  await expect(page.getByText("AI-created card")).toBeVisible();
});

test("chat errors are displayed without hiding the board", async ({ page }) => {
  await signIn(page, {
    status: 502,
    body: { detail: "OpenRouter request failed" },
  });

  await page.getByRole("button", { name: "AI Assistant" }).click();
  await page.getByLabel("Message the assistant").fill("Help me plan");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator("p[role='alert']")).toHaveText(
    "OpenRouter request failed"
  );
  await expect(page.getByText("Seeded card")).toBeVisible();
});
