import { expect, it } from "vitest";
import { readPortfolioView, portfolioViewQuery, sortHoldings } from "./portfolio-view";
it("round trips only nonsensitive view metadata and preserves demo", () => {
  const view = readPortfolioView({ types: "cash,crypto,nonsense", sort: "date", deleted: "true", view: "cards" });
  expect(view).toEqual({ types: ["cash", "crypto"], sort: "date", deleted: true, view: "cards" });
  expect(portfolioViewQuery({ demo: "true", unrelated: "keep" }, view)).toEqual({ demo: "true", unrelated: "keep", types: "cash,crypto", sort: "date", deleted: "true", view: "cards" });
  expect(readPortfolioView({ types: "secret-holding", sort: "bad" })).toEqual({ types: [], sort: "value", deleted: false, view: "list" });
});
it("sorts newest by creation time, placing unknown legacy dates last without interpreting ids", () => {
  const base = { name: "Asset", type: "cash", quantity: 1, value: 1, baseValue: 1, isDeleted: false };
  const old = { ...base, id: "99999999999", createdAt: "2025-01-01" };
  const recent = { ...base, id: "opaque", createdAt: "2026-01-01" };
  const legacy = { ...base, id: 999999999999999 };
  expect(sortHoldings([old, legacy, recent], "date")).toEqual([recent, old, legacy]);
  expect(sortHoldings([old, legacy, recent], "date")).not.toBe([old, legacy, recent]);
});
