import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Asset, { type AssetType } from "./index";

const asset: AssetType = { _id: "holding-1", name: "Manual holding", type: "cash", quantity: 1, baseValue: 100, value: 100, isDeleted: false };
afterEach(cleanup);

it.each(["cash", "metals", "real_estate"])("does not offer a provider refresh for unsupported %s holdings", (type) => {
  render(<Asset asset={{ ...asset, type }} handleEditAsset={vi.fn()} handleUpdatePrice={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /Update price/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Edit/ })).toBeEnabled();
});
