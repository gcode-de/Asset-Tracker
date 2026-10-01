import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import ApiLimitBadge, { getApiLimitInfo } from "./index";
const session = vi.hoisted(() => ({ status: "authenticated", email: "user@example.com" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: session.status, data: { user: { email: session.email } } }) }));
beforeEach(() => { session.status = "authenticated"; session.email = "user@example.com"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("aggregate API badge", () => {
  it("clears previous identity totals and ignores its pending requests on account switch", async () => {
    let resolveOld!: (response: Response) => void;
    let resolveNew!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ count: 26, limit: 50, remaining: 24 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveNew = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const onRemainingChange = vi.fn();
    const { rerender } = render(<ApiLimitBadge onRemainingChange={onRemainingChange} />);
    await screen.findByText(/26\/50/);
    act(() => window.dispatchEvent(new Event("api-counter-changed")));
    session.email = "other@example.com";
    rerender(<ApiLimitBadge onRemainingChange={onRemainingChange} />);
    expect(screen.queryByText(/26\/50/)).not.toBeInTheDocument();
    expect(screen.getByText(/Loading app-tracked/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => resolveOld(Response.json({ count: 27, limit: 50, remaining: 23 })));
    expect(onRemainingChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/27\/50/)).not.toBeInTheDocument();
    await act(async () => resolveNew(Response.json({ count: 1, limit: 25, remaining: 24 })));
    await screen.findByText(/1\/25/);
    expect(onRemainingChange).toHaveBeenCalledTimes(2);
    session.status = "unauthenticated";
    rerender(<ApiLimitBadge onRemainingChange={onRemainingChange} />);
    expect(screen.queryByText(/1\/25/)).not.toBeInTheDocument();
  });
  it.each(["count", "limit", "remaining"])("rejects fractional allowance %s", async (field) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ count: 1, limit: 25, remaining: 24, [field]: 1.5 })));
    await expect(getApiLimitInfo()).rejects.toThrow(/Unexpected allowance/);
  });
  it("preserves zero instead of replacing it with 25", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ count: 50, limit: 50, remaining: 0 })));
    expect((await getApiLimitInfo()).remaining).toBe(0);
  });
  it("displays aggregate quota and revalidates on updates", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ count: 26, limit: 50, remaining: 24 }));
    vi.stubGlobal("fetch", fetcher);
    const onRemainingChange = vi.fn();
    render(<ApiLimitBadge onRemainingChange={onRemainingChange} />);
    await screen.findByText(/26\/50/);
    fetcher.mockResolvedValue(Response.json({ count: 0, limit: 75, remaining: 75 }));
    act(() => window.dispatchEvent(new Event("api-counter-changed")));
    await screen.findByText(/0\/75/);
    await waitFor(() => expect(onRemainingChange).toHaveBeenLastCalledWith(75));
    expect(screen.getByText(/app-tracked/i)).toBeInTheDocument();
  });
  it("does not invent unused quota when a request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway secret", { status: 504 })));
    await expect(getApiLimitInfo()).rejects.toThrow(/504/);
  });
});
