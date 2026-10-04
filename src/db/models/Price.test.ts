import { expect, it } from "vitest";
import Price from "./Price";

it("retains the precious-metal price unit in the real Mongoose schema", () => {
  const price = new Price({ symbol: "XAUUSD", value: 2700, currency: "EUR", unit: "troy_ounce", source: "alphavantage" });
  expect(price.toObject()).toMatchObject({ symbol: "XAUUSD", value: 2700, currency: "EUR", unit: "troy_ounce", source: "alphavantage" });
  expect(price.validateSync()).toBeUndefined();
});

it("does not label stock prices as ounces", () => {
  expect(new Price({ symbol: "AAPL", value: 90, currency: "EUR" }).toObject()).not.toHaveProperty("unit");
});
