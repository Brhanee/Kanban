import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("opens the AI assistant from the board header", async () => {
    const onToggleAssistant = vi.fn();
    render(<KanbanBoard onToggleAssistant={onToggleAssistant} />);

    await userEvent.click(screen.getByRole("button", { name: "AI Assistant" }));

    expect(onToggleAssistant).toHaveBeenCalledOnce();
  });

  it("renames a column once when the edit is committed", async () => {
    const onRenameColumn = vi.fn();
    render(<KanbanBoard onRenameColumn={onRenameColumn} />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name{Enter}");
    expect(onRenameColumn).toHaveBeenCalledOnce();
    expect(onRenameColumn).toHaveBeenCalledWith("col-backlog", "New Name");
  });

  it("restores the column title when cleared or cancelled", async () => {
    const onRenameColumn = vi.fn();
    render(<KanbanBoard onRenameColumn={onRenameColumn} />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveValue("Backlog");
    await userEvent.type(input, " draft{Escape}");
    expect(input).toHaveValue("Backlog");
    expect(onRenameColumn).not.toHaveBeenCalled();
  });

  it("edits a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: "Edit Align roadmap themes" })
    );
    const title = within(column).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Edited title");
    const details = within(column).getByLabelText("Card details");
    await userEvent.clear(details);
    await userEvent.type(details, "Edited details");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("Edited title")).toBeInTheDocument();
    expect(within(column).getByText("Edited details")).toBeInTheDocument();
    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});
