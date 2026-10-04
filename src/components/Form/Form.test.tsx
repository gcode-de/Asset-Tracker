import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Form from "./index";

afterEach(cleanup);

it.each(["XAUUSD", "XAGUSD"])("explains %s uses troy ounces, leaving existing quantities unchanged", (abb) => {
  render(<Form initialValues={{ abb, type: "metals", quantity: 100, baseValue: 20 }} />);
  expect(screen.getByLabelText("Units (troy oz) *")).toHaveValue(100);
  expect(screen.getByLabelText("Unit Price (€/troy oz) *")).toHaveValue(20);
  expect(screen.getByText(/not grams.*not converted automatically/)).toBeInTheDocument();
});
