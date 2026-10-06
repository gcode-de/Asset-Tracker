import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig, useSWRConfig } from "swr";
import App from "@/pages/index";

const mocks = vi.hoisted(() => ({
  session: { data: { user: { email: "first@example.com" } }, status: "authenticated" },
  query: {} as Record<string, string>,
  routerReady: true,
  toast: vi.fn(),
  put: vi.fn(), post: vi.fn(),
}));
vi.mock("axios", () => ({ default: { create: () => ({ put: mocks.put, post: mocks.post }) } }));
vi.mock("next-auth/react", () => ({ useSession: () => mocks.session }));
vi.mock("next/router", () => ({ useRouter: () => ({ isReady: mocks.routerReady, query: mocks.query }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/Login", () => ({ default: () => null }));
vi.mock("@/components/ApiLimitBadge", () => ({ default: () => null }));
vi.mock("@/components/AssetSearchDialog", () => ({ default: () => null }));

const holding = { _id: "holding-1", name: "Apple holding", abb: "AAPL", type: "stocks", quantity: 2, baseValue: 10, value: 20, isDeleted: false };
const user = { _id: "first", email: "first@example.com", assets: [holding] };
const prices = [{ symbol: "AAPL", value: 42, recordedAt: "2026-10-02T12:00:00Z" }];

beforeEach(() => { vi.clearAllMocks(); mocks.routerReady = true; mocks.query = {}; mocks.session = { data: { user: { email: "first@example.com" } }, status: "authenticated" }; window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup() {
  const pending: Record<string, ((response: Response) => void)[]> = {};
  const fetcher = vi.fn((url: string) => new Promise<Response>((resolve) => { (pending[url] ??= []).push(resolve); }));
  vi.stubGlobal("fetch", fetcher);
  const cache = new Map();
  let revalidate!: (url: string) => Promise<unknown>;
  function CacheControl() {
    const { mutate } = useSWRConfig();
    revalidate = (url) => mutate([url, mocks.session.data.user.email]);
    return null;
  }
  const view = () => <SWRConfig value={{ provider: () => cache, fetcher: (url: string) => fetch(url).then((response) => response.json()), shouldRetryOnError: false, dedupingInterval: 0, revalidateOnFocus: false }}><CacheControl /><App /></SWRConfig>;
  const rendered = render(view());
  return {
    fetcher,
    revalidate: (url: string) => revalidate(url),
    rerender: () => rendered.rerender(view()),
    resolve: async (url: string, data: unknown, status = 200) => {
      expect(pending[url]?.length, `pending ${url}`).toBeGreaterThan(0);
      await act(async () => { pending[url].shift()!(Response.json(data, { status })); });
    },
  };
}

it("keeps the ready portfolio and labels the retained cache when price revalidation fails", async () => {
  const { resolve, revalidate } = setup();
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  act(() => { void revalidate("/api/prices"); });
  expect(screen.queryByText("Loading your portfolio…")).not.toBeInTheDocument();
  await resolve("/api/prices", { error: "Unavailable" }, 503);
  expect(screen.getAllByText("84 €").length).toBeGreaterThan(0);
  expect(screen.getByText("Cached prices could not be refreshed. Showing the last available cached values.")).toBeInTheDocument();
});

it("waits for holdings when cached prices finish first", async () => {
  const { fetcher, resolve } = setup();
  await resolve("/api/prices", prices);
  expect(screen.getByText("Loading your portfolio…")).toBeInTheDocument();
  expect(screen.queryByText("Your portfolio is empty")).not.toBeInTheDocument();
  await resolve("/api/user", user);
  expect(screen.getAllByText("84 €").length).toBeGreaterThan(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["user-first", "prices-first"])("shows saved holdings on a cached-price HTTP failure (%s)", async (order) => {
  const { resolve, fetcher } = setup();
  if (order === "user-first") await resolve("/api/user", user);
  await resolve("/api/prices", { error: "Unavailable" }, 503);
  if (order === "prices-first") {
    expect(screen.getByText("Loading your portfolio…")).toBeInTheDocument();
    await resolve("/api/user", user);
  }
  expect(screen.getByText("Apple holding")).toBeInTheDocument();
  expect(screen.getByText("Cached prices are temporarily unavailable. Showing saved holding values.")).toBeInTheDocument();
  expect(screen.getAllByText("20 €").length).toBeGreaterThan(0);
  expect(screen.queryByText("Loading your portfolio…")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/user", "/api/prices"]);
});

it("falls back on a malformed cached-price response", async () => {
  const { resolve } = setup();
  await resolve("/api/prices", { unexpected: "object" });
  await resolve("/api/user", user);
  expect(screen.getByText("Saved holdings loaded")).toBeInTheDocument();
  expect(screen.getByText("Apple holding")).toBeInTheDocument();
});

it("only shows the genuine empty state after both reads settle", async () => {
  const { resolve } = setup();
  await resolve("/api/user", { ...user, assets: [] });
  expect(screen.queryByText("Your portfolio is empty")).not.toBeInTheDocument();
  await resolve("/api/prices", []);
  expect(screen.getByText("Your portfolio is empty")).toBeInTheDocument();
});

it("does not fetch server data before authentication", async () => {
  mocks.session.status = "loading";
  const { rerender, fetcher, resolve } = setup();
  expect(screen.getByRole("heading", { name: "Asset Tracker" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Loading portfolio" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Loading your portfolio…");
  expect(screen.getByRole("button", { name: "Add asset" })).toBeDisabled();
  expect(fetcher).not.toHaveBeenCalled();
  mocks.session.status = "unauthenticated";
  rerender();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: /Open interactive demo/ })).toBeInTheDocument();
  mocks.session.status = "authenticated";
  rerender();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await resolve("/api/user", user);
  await resolve("/api/prices", []);
});

it("preserves edited quantity while stale holdings and new cached prices settle", async () => {
  const { resolve, revalidate, fetcher } = setup();
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  act(() => { void revalidate("/api/user"); void revalidate("/api/prices"); });
  fireEvent.click(screen.getByRole("button", { name: "Edit Apple holding" }));
  fireEvent.change(screen.getByLabelText("Units *"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  await resolve("/api/user", user);
  await resolve("/api/prices", [{ ...prices[0], value: 50 }]);
  expect(screen.getAllByText("150 €").length).toBeGreaterThan(0);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/user", "/api/prices", "/api/user", "/api/prices"]);

  // A read started after the successful edit is authoritative, not a frozen snapshot.
  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", { ...user, assets: [
    { ...holding, quantity: 3, baseValue: 42, value: 126 },
    { ...holding, _id: "holding-2", name: "Added elsewhere", abb: "MSFT", quantity: 1 },
  ] });
  expect(screen.getByText("Added elsewhere")).toBeInTheDocument();
  expect(screen.getAllByText("150 €").length).toBeGreaterThan(0);

  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", { ...user, assets: [{ ...holding, quantity: 4, name: "Updated elsewhere" }] });
  expect(screen.queryByText("Added elsewhere")).not.toBeInTheDocument();
  expect(screen.queryByText("Apple holding")).not.toBeInTheDocument();
  expect(screen.getByText("Updated elsewhere")).toBeInTheDocument();
  expect(screen.getAllByText("200 €").length).toBeGreaterThan(0);
});

it("keeps authoritative changes received while an edit save is pending", async () => {
  const { resolve, revalidate } = setup();
  let finishSave!: () => void;
  mocks.put.mockImplementationOnce(() => new Promise<void>((resolveSave) => { finishSave = resolveSave; }));
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  fireEvent.click(screen.getByRole("button", { name: "Edit Apple holding" }));
  fireEvent.change(screen.getByLabelText("Units *"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", { ...user, assets: [holding, { ...holding, _id: "holding-2", name: "Concurrent holding", abb: "MSFT" }] });
  await act(async () => { finishSave(); });
  expect(screen.getByText("Concurrent holding")).toBeInTheDocument();
  expect(screen.getAllByText("126 €").length).toBeGreaterThan(0);
});

it("keeps a created holding through an older read but accepts its later authoritative removal", async () => {
  const { resolve, revalidate } = setup();
  const created = { ...holding, _id: "created", name: "Created holding", abb: "MSFT" };
  mocks.post.mockResolvedValueOnce({ data: created });
  await resolve("/api/user", user);
  await resolve("/api/prices", [{ symbol: "MSFT", value: 10 }]);
  act(() => { void revalidate("/api/user"); });
  fireEvent.pointerDown(screen.getByRole("button", { name: "Add asset" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Stock" }));
  fireEvent.change(screen.getByLabelText("Name *"), { target: { value: created.name } });
  fireEvent.change(screen.getByLabelText("Units *"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Unit Price *"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await resolve("/api/user", user);
  expect(screen.getByText(created.name)).toBeInTheDocument();
  // The prices panel uses the mutated holdings, even before another server read.
  expect(screen.getByRole("cell", { name: "MSFT" })).toBeInTheDocument();
  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", { ...user, assets: [holding, created] });
  expect(screen.getAllByText(created.name)).toHaveLength(1);
  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", user);
  expect(screen.queryByText(created.name)).not.toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "MSFT" })).not.toBeInTheDocument();
});

it("keeps a soft deletion through an older read but accepts a later authoritative restoration", async () => {
  const { resolve, revalidate } = setup();
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  act(() => { void revalidate("/api/user"); });
  fireEvent.click(screen.getByRole("button", { name: "Edit Apple holding" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Apple holding" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await resolve("/api/user", user);
  expect(screen.queryByText(holding.name)).not.toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "AAPL" })).not.toBeInTheDocument();
  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", { ...user, assets: [{ ...holding, isDeleted: true }] });
  expect(screen.queryByText(holding.name)).not.toBeInTheDocument();
  act(() => { void revalidate("/api/user"); });
  await resolve("/api/user", user);
  expect(screen.getByText(holding.name)).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "AAPL" })).toBeInTheDocument();
});

it("resets local edits and dialogs when switching a ready account", async () => {
  const { resolve, rerender } = setup();
  await resolve("/api/user", user);
  await resolve("/api/prices", []);
  fireEvent.click(screen.getByRole("button", { name: "Edit Apple holding" }));
  fireEvent.change(screen.getByLabelText("Units *"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Edit Apple holding" }));
  mocks.session.data.user.email = "second@example.com";
  rerender();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Apple holding")).not.toBeInTheDocument();
  expect(screen.queryByText("20 €")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Loading portfolio" })).toBeInTheDocument();
  await resolve("/api/user", { ...user, email: "second@example.com", assets: [] });
  await resolve("/api/prices", []);
  expect(screen.getByText("Your portfolio is empty")).toBeInTheDocument();
});

it("keeps demo edits local without cached-price or provider requests", async () => {
  mocks.query = { demo: "true" };
  const { fetcher } = setup();
  expect(screen.getByText("Anonymous local demo")).toBeInTheDocument();
  const edit = screen.getAllByRole("button", { name: /^Edit / })[0];
  fireEvent.click(edit);
  fireEvent.change(screen.getByLabelText(/^(Units|Quantity).*\*/), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  expect(mocks.toast).toHaveBeenCalledWith({ title: "Demo asset updated" });
  expect(fetcher).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(window.localStorage.length).toBe(1);
});

it("preserves an edited holding price instead of replacing it with the existing cached quote", async () => {
  const { resolve, fetcher } = setup();
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  fireEvent.click(screen.getByRole("button", { name: "Edit Apple holding" }));
  fireEvent.change(screen.getByLabelText("Units *"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Unit Price *"), { target: { value: "50" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.put).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  expect(screen.getAllByText("150 €").length).toBeGreaterThan(0);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/user", "/api/prices"]);
});

it("lets a failed holdings read be retried without waiting for cached prices", async () => {
  const { fetcher, resolve } = setup();
  await resolve("/api/user", { error: "Unavailable" }, 503);
  expect(screen.getByText("Live account unavailable")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Asset Tracker" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Loading portfolio" })).not.toBeInTheDocument();
  expect(screen.queryByText("Loading your portfolio…")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry portfolio" }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url === "/api/user")).toHaveLength(2));
  await resolve("/api/prices", prices);
  await resolve("/api/user", user);
  expect(await screen.findByText("Apple holding")).toBeInTheDocument();
});

it("does not reuse a previous account's pending reads after an account switch", async () => {
  const { fetcher, resolve, rerender } = setup();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  mocks.session = { data: { user: { email: "second@example.com" } }, status: "authenticated" };
  rerender();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  expect(screen.queryByText("Apple holding")).not.toBeInTheDocument();
  expect(screen.getByText("Loading your portfolio…")).toBeInTheDocument();
  await resolve("/api/user", { _id: "second", email: "second@example.com", assets: [{ ...holding, name: "Second account holding" }] });
  await resolve("/api/prices", []);
  expect(await screen.findByText("Second account holding")).toBeInTheDocument();
  expect(screen.queryByText("Apple holding")).not.toBeInTheDocument();
});

it("starts holdings and cached prices concurrently and keeps the portfolio loader until prices settle", async () => {
  const { fetcher, resolve } = setup();
  await waitFor(() => expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/user", "/api/prices"]));
  expect(screen.getByText("Loading your portfolio…")).toBeInTheDocument();
  await resolve("/api/user", user);
  expect(screen.getByText("Loading your portfolio…")).toBeInTheDocument();
  expect(screen.queryByText("Your portfolio is empty")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Asset Tracker" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Loading portfolio" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Add asset" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh prices" })).toBeDisabled();
  expect(screen.queryByText("Apple holding")).not.toBeInTheDocument();
  expect(screen.queryByText(/0 €/)).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  await resolve("/api/prices", prices);
  expect(await screen.findByText("Apple holding")).toBeInTheDocument();
  expect(screen.getAllByText("84 €").length).toBeGreaterThan(0);
  expect(screen.queryByText("Loading your portfolio…")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/user", "/api/prices"]);
});

it("renders the safe shell before the router is ready without starting reads", () => {
  mocks.routerReady = false;
  const { fetcher } = setup();
  expect(screen.getByRole("heading", { name: "Asset Tracker" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Loading portfolio" })).toBeInTheDocument();
  expect(screen.queryByText("Your portfolio is empty")).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it("removes skeletons immediately on quick success without advancing any loading timer", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { resolve, fetcher } = setup();
  expect(screen.getByRole("region", { name: "Loading portfolio" })).toBeInTheDocument();
  await resolve("/api/user", user);
  await resolve("/api/prices", prices);
  expect(screen.queryByRole("region", { name: "Loading portfolio" })).not.toBeInTheDocument();
  expect(screen.getByText("Apple holding")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
