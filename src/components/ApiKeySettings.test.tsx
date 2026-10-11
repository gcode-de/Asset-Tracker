import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
import ApiKeySettings from "./ApiKeySettings";

describe("ApiKeySettings", () => {
  it("revalidates aggregate allowance after deleting a key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [{ id: "key-1", maskedSuffix: "••••abcd" }] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [] }) }));
    const listener = vi.fn();
    window.addEventListener("api-counter-changed", listener);
    render(<ApiKeySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Market data settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete ••••abcd" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete ••••abcd" }));
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    window.removeEventListener("api-counter-changed", listener);
  });
  it("submits a private key then clears the input while rendering metadata only", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ key: { id: "key-1", maskedSuffix: "••••abcd", createdAt: "2026-09-30T00:00:00.000Z" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const counterChanged = vi.fn();
    window.addEventListener("api-counter-changed", counterChanged);
    render(<ApiKeySettings />);

    fireEvent.click(screen.getByRole("button", { name: "Market data settings" }));
    await screen.findByText("No private keys saved.");
    fireEvent.change(screen.getByLabelText("Alpha Vantage API key"), { target: { value: "private-alpha-key-abcd" } });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => expect(screen.getByText("••••abcd")).toBeInTheDocument());
    expect(screen.getByLabelText("Alpha Vantage API key")).toHaveValue("");
    expect(screen.queryByText("private-alpha-key-abcd")).not.toBeInTheDocument();
    expect(counterChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener("api-counter-changed", counterChanged);
  });
});
