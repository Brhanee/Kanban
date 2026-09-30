import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

describe("Home login flow", () => {
  it("requires valid credentials before showing the board and allows logout", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(usernameInput, "wrong");
    await user.type(passwordInput, "wrong");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    expect(screen.queryByText(/kanban studio/i)).not.toBeInTheDocument();

    await user.clear(usernameInput);
    await user.clear(passwordInput);
    await user.type(usernameInput, "user");
    await user.type(passwordInput, "password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByText(/kanban studio/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /log out/i }));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });
});
