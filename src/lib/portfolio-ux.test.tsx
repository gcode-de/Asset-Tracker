import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { valuationLabel, refreshGuidance } from "./portfolio-ux";
afterEach(cleanup);
import PortfolioOverview from "@/components/PortfolioOverview";
import { parseCostBasis } from "./portfolio-ux";
const holding = { id: "opaque", name: "Legacy", type: "stocks", quantity: 1, baseValue: 100, value: 100, isDeleted: false };
describe("valuation provenance", () => {
  it("distinguishes manual, cached with unknown time and fixed demo values", () => {
    expect(valuationLabel(holding)).toMatch(/Manual valuation/);
    expect(valuationLabel({ ...holding, valuationSource: "cached" })).toMatch(/Cached quote.*unknown/i);
    expect(valuationLabel({ ...holding, valuationSource: "cached", quoteTimestamp: "2026-01-01T00:00:00Z", priceUpdatedAt: "2026-10-10T00:00:00Z" })).toMatch(/01.01.2026/);
    expect(valuationLabel(holding, true)).toMatch(/Fixed demo snapshot/);
  });
  it("labels mixed/manual coverage beside an overall estimated EUR value", () => {
    render(<PortfolioOverview assets={[holding, { ...holding, id: "cached", valuationSource: "cached" }]} />);
    expect(screen.getByText(/Estimated portfolio value.*EUR/)).toBeInTheDocument();
    expect(screen.getByText(/1 cached.*1 manual.*not live/i)).toBeInTheDocument();
  });
  it("aligns every class guidance with the shared provider eligibility and metal identity", () => {
    expect(refreshGuidance("cash", "USD")).toMatch(/Manual valuation/);
    expect(refreshGuidance("real_estate", "HOME")).toMatch(/Manual valuation/);
    expect(refreshGuidance("stocks", "")).toMatch(/ticker/i);
    expect(refreshGuidance("crypto", "BTC")).toMatch(/supported/i);
    expect(refreshGuidance("metals", "GOLD")).toMatch(/Manual.*XAU.*XAG/);
    expect(refreshGuidance("metals", "XAUUSD")).toMatch(/EUR per troy ounce/);
  });
});
describe("cost basis truthfulness", () => {
  it("keeps blank, null and legacy missing unknown but explicit zero known", () => {
    expect(parseCostBasis("")).toBeNull();
    expect(parseCostBasis(null)).toBeNull();
    expect(parseCostBasis(undefined)).toBeNull();
    expect(parseCostBasis("0")).toBe(0);
    expect(() => parseCostBasis(-1)).toThrow();
    expect(() => parseCostBasis("nonsense")).toThrow();
  });
  it("never invents performance for missing basis", () => {
    render(<PortfolioOverview assets={[holding]} />);
    expect(screen.getByText(/Performance unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/vs. cost basis/)).not.toBeInTheDocument();
  });
  it("labels performance as known-subset comparison not whole or period return", () => {
    render(<PortfolioOverview assets={[holding, { ...holding, id: "known", costBasis: 50 }]} />);
    expect(screen.getByText(/1 of 2 holdings with known cost basis/)).toBeInTheDocument();
    expect(screen.getByText(/\+50,00.*100.0%/)).toBeInTheDocument();
  });
  it("does not fabricate percentage for explicit zero", () => {
    render(<PortfolioOverview assets={[{ ...holding, costBasis: 0 }]} />);
    expect(screen.getByText(/percentage unavailable for zero basis/)).toBeInTheDocument();
  });
});
