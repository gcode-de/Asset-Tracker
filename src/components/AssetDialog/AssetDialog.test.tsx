import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssetDialog from ".";

afterEach(cleanup);
describe("AssetDialog", () => {
  it("closes cleanly when an edited field returns to its opening value", () => {
    const close = vi.fn();
    render(<AssetDialog open initialValues={{ name: "Gold", type: "metals" }} onOpenChange={close} />);
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Changed" } });
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Gold" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
  });
  it("protects dirty edits and stays open after a failed deletion", async () => {
    const close = vi.fn();
    render(<AssetDialog open initialValues={{ id: "a", name: "Gold", type: "metals" }} onOpenChange={close} onDelete={async () => false} />);
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Gold" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be deleted"));
    expect(close).not.toHaveBeenCalled();
  });
  it("bounds the sheet with a separately scrollable body and reachable footer", () => {
    render(<AssetDialog open initialValues={{ name: "Gold", type: "metals", abb: "XAU" }} />);
    expect(screen.getByRole("dialog")).toHaveClass("asset-dialog");
    expect(screen.getByTestId("asset-dialog-body")).toHaveClass("overflow-y-auto", "min-h-0");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("h-11", "w-11");
  });
  it("submits edited quantity and the recalculated value", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(
      <AssetDialog
        open
        onOpenChange={vi.fn()}
        initialValues={{ id: "asset-1", name: "Index Fund", type: "stocks", abb: "ETF", quantity: 2, baseValue: 100, value: 200, isDeleted: false }}
        onSubmit={(event) => {
          event.preventDefault();
          submitted(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      />,
    );

    const units = screen.getByLabelText("Units *");
    await user.clear(units);
    await user.type(units, "3");
    await user.type(screen.getByLabelText("Total Cost Basis"), "240");
    expect(screen.getByLabelText("Current Value (calculated)")).toHaveValue(300);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ name: "Index Fund", quantity: "3", value: "300.00", costBasis: "240" }));
  });
});
