import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AssetList from ".";
afterEach(cleanup);
const gold = { id: "opaque", name: "Physical Gold with a complete unusually long holding name", abb: "XAU", type: "metals", quantity: 2, baseValue: 1234.5, value: 2469, isDeleted: false };
it("renders compact aligned comparison rows without decorative photos and keeps full names/units/actions", () => {
  const edit = vi.fn();
  render(<AssetList assets={[gold]} view="list" demoMode handleEditAsset={edit} />);
  const row = screen.getByRole("article", { name: gold.name });
  expect(within(row).getByText(gold.name)).toBeInTheDocument();
  expect(within(row).getByText(/^2 troy oz$/)).toBeInTheDocument();
  expect(within(row).getByText(/1.234,50.*\/troy oz/)).toBeInTheDocument();
  expect(within(row).getByText(/2.469,00/)).toHaveClass("tabular-nums");
  expect(within(row).getByText(/Fixed demo snapshot/)).toBeInTheDocument();
  expect(row.querySelector('[style*="background-image"]')).toBeNull();
  within(row).getByRole("button", { name: `Edit ${gold.name}` }).click();
  expect(edit).toHaveBeenCalledWith("opaque");
});
it("preserves cards with complete accessible holding names", () => {
  render(<AssetList assets={[gold]} view="cards" handleEditAsset={vi.fn()} />);
  expect(screen.getByRole("article", { name: gold.name })).toBeInTheDocument();
  expect(screen.getByText(/Manual valuation/)).toBeInTheDocument();
});
