import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@/pages/index";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), mutate: vi.fn(),
  user: { _id: "user-1", email: "user@example.com", assets: [
    { _id: "stock-id", name: "Apple holding", abb: "AAPL", type: "stocks", quantity: 2, baseValue: 10, value: 20, isDeleted: false },
    { _id: "crypto-id", name: "Bitcoin holding", abb: "BTC", type: "crypto", quantity: 1, baseValue: 10, value: 10, isDeleted: false },
  ] },
  prices: [] as unknown[],
}));
vi.mock("swr", () => ({ default: (key: string) => ({ data: key === "/api/user" ? mocks.user : mocks.prices, mutate: () => mocks.mutate(key), isLoading: false }), mutate: (...args: unknown[]) => mocks.mutate(...args) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "user@example.com" } }, status: "authenticated" }) }));
vi.mock("next/router", () => ({ useRouter: () => ({ isReady: true, query: {} }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/Login", () => ({ default: () => null }));
vi.mock("@/components/AssetDialog", () => ({ default: () => null }));
vi.mock("@/components/AssetSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/ApiLimitBadge", () => ({ default: () => null }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setupPendingRefresh() {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn((url: string) => url === "/api/prices/fetch"
    ? new Promise<Response>((done) => { resolve = done; })
    : Promise.resolve(Response.json([])));
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  return { fetcher, resolve: (response: Response) => resolve(response), refreshCalls: () => fetcher.mock.calls.filter(([url]) => url === "/api/prices/fetch") };
}

it("locks individual and batch controls while an asset icon refresh is pending", async () => {
  const { resolve, refreshCalls } = setupPendingRefresh();
  const stock = await screen.findByRole("button", { name: "Update price for Apple holding" });
  const crypto = screen.getByRole("button", { name: "Update price for Bitcoin holding" });
  // Same-tick clicks must be rejected even before React paints the disabled state.
  act(() => { stock.click(); stock.click(); crypto.click(); });
  expect(refreshCalls()).toHaveLength(1);
  expect(stock).toBeDisabled();
  expect(stock).toHaveAttribute("aria-busy", "true");
  expect(crypto).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh prices" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Fetch latest prices" })).toBeDisabled();
  expect(refreshCalls()[0]).toEqual(["/api/prices/fetch", expect.objectContaining({ method: "POST", body: JSON.stringify({ symbol: "AAPL" }) })]);
  await act(async () => resolve(Response.json({ apiCalls: 1, remainingCalls: 24, results: [{ symbol: "AAPL", ok: true }] })));
  await waitFor(() => expect(stock).toBeEnabled());
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "AAPL updated" }));
});

it("revalidates cached prices and shows the new holding value after an individual refresh", async () => {
  const { fetcher, resolve } = setupPendingRefresh();
  const stock = await screen.findByRole("button", { name: "Update price for Apple holding" });
  fireEvent.click(stock);
  fetcher.mockImplementation((url: string) => Promise.resolve(Response.json(url === "/api/prices" ? [{ symbol: "AAPL", value: 42, recordedAt: "2026-10-02T12:00:00Z" }] : [])));
  await act(async () => resolve(Response.json({ apiCalls: 1, remainingCalls: 24, results: [{ symbol: "AAPL", ok: true }] })));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/prices"));
  expect(mocks.mutate).toHaveBeenCalledWith("/api/user");
  expect(screen.getByText("84 €")).toBeInTheDocument();
});

it.each([200, 429])("revalidates allowance and releases the icon after HTTP %s failure", async (status) => {
  const counterChanged = vi.fn();
  window.addEventListener("api-counter-changed", counterChanged);
  try {
    const { resolve, refreshCalls } = setupPendingRefresh();
    const crypto = await screen.findByRole("button", { name: "Update price for Bitcoin holding" });
    fireEvent.click(crypto);
    expect(refreshCalls()[0]).toEqual(["/api/prices/fetch", expect.objectContaining({ body: JSON.stringify({ symbol: "BTC" }) })]);
    await act(async () => resolve(Response.json(status === 429
      ? { apiCalls: 0, remainingCalls: 0, error: "API_DAILY_LIMIT" }
      : { apiCalls: 1, remainingCalls: 7, results: [{ symbol: "BTC", ok: false, reason: "No valid price available for this symbol." }] }, { status })));
    expect(counterChanged).toHaveBeenCalledTimes(1);
    expect(crypto).toHaveAttribute("aria-busy", "false");
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "BTC could not be updated", variant: "destructive" }));
    if (status === 429) {
      expect(crypto).toBeDisabled();
      expect(screen.getByRole("button", { name: "Refresh prices" })).toBeDisabled();
    } else {
      expect(crypto).toBeEnabled();
    }
  } finally {
    window.removeEventListener("api-counter-changed", counterChanged);
  }
});

it.each(["Refresh prices", "Fetch latest prices"])("prevents same-tick asset clicks during the %s batch", async (name) => {
  const { resolve, refreshCalls } = setupPendingRefresh();
  const stock = await screen.findByRole("button", { name: "Update price for Apple holding" });
  const batch = screen.getByRole("button", { name });
  act(() => { batch.click(); batch.click(); stock.click(); });
  expect(refreshCalls()).toHaveLength(1);
  expect(stock).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh prices" })).toBeDisabled();
  // A terminal response ends this batch without spending quota on the next asset.
  await act(async () => resolve(Response.json({ apiCalls: 1, remainingCalls: 9, results: [{ symbol: "AAPL", ok: false, reason: "ALPHA_RATE_LIMIT_BURST: Provider requests paused." }] })));
  await waitFor(() => expect(stock).toBeEnabled());
  expect(refreshCalls()).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Fetch latest prices" })).toBeEnabled();
});
