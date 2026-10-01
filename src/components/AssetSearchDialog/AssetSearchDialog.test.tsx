import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("axios", () => ({ default: { get } }));
vi.mock("@/components/Favorites", () => ({ FavoriteToggle: () => null, FavoritesList: () => null }));
import AssetSearchDialog from "./index";
afterEach(cleanup);
describe("search allowance updates", () => {
  it.each([false, true])("revalidates aggregate quota after search (failure %s)", async (failure) => {
    if (failure) get.mockRejectedValue(new Error("Search failed"));
    else get.mockResolvedValue({ data: { matches: [] } });
    const listener = vi.fn();
    window.addEventListener("api-counter-changed", listener);
    render(<AssetSearchDialog open />);
    fireEvent.change(screen.getByRole("textbox", { name: "Symbol or asset name" }), { target: { value: "AAPL" } });
    fireEvent.submit(screen.getByRole("button", { name: "Go" }).closest("form")!);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    window.removeEventListener("api-counter-changed", listener);
  });
});
