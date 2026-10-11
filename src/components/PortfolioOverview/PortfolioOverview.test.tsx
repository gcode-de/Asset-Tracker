import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PortfolioOverview from ".";
import type { AssetType } from "@/components/Asset";

const assets: AssetType[] = [
  { id: 1, name: "ETF", type: "stocks", quantity: 1, baseValue: 6000, value: 6000, costBasis: 5000, isDeleted: false },
  { id: 2, name: "Cash", type: "cash", quantity: 1, baseValue: 4000, value: 4000, costBasis: 4000, isDeleted: false },
  { id: 3, name: "Archived", type: "cash", quantity: 1, baseValue: 9000, value: 9000, costBasis: 1, isDeleted: true },
];

describe("PortfolioOverview", () => {
  it("excludes deleted assets and shows value, performance and allocation", () => {
    render(<PortfolioOverview assets={assets} />);

    expect(screen.getByText("10.000,00 €")).toBeInTheDocument();
    expect(screen.getByText(/\+1.000,00 € \(\+11.1%\)/)).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.queryByText("19.000 €")).not.toBeInTheDocument();
  });
});
