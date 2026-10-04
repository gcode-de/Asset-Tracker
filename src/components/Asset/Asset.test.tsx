import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Asset, { type AssetType } from "./index";

const asset: AssetType = { _id: "holding-1", name: "Manual holding", type: "cash", quantity: 1, baseValue: 100, value: 100, isDeleted: false };
afterEach(cleanup);

it.each(["XAUUSD", "XAGUSD"])("offers a metal icon refresh preserving %s and labels its troy-ounce unit", (abb) => {
  const refresh = vi.fn();
  render(<Asset asset={{ ...asset, abb, type: "metals" }} handleEditAsset={vi.fn()} handleUpdatePrice={refresh} />);
  screen.getByRole("button", { name: /Update price/ }).click();
  expect(refresh).toHaveBeenCalledWith(abb);
  expect(screen.getByText("Units (troy oz)")).toBeInTheDocument();
  expect(screen.getByText("Unit Price (€/troy oz)")).toBeInTheDocument();
});

it.each(["cash", "metals", "real_estate"])("does not offer a provider refresh for unsupported %s holdings", (type) => {
  render(<Asset asset={{ ...asset, type }} handleEditAsset={vi.fn()} handleUpdatePrice={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /Update price/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Edit/ })).toBeEnabled();
});
