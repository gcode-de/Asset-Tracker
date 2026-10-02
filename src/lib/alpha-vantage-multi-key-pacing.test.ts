import crypto from "crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ state: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, counter: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, keys: vi.fn() }));
vi.mock("@/db/models/AlphaVantageState", () => ({ default: mocks.state }));
vi.mock("@/db/models/ApiCounter", () => ({ default: mocks.counter }));
vi.mock("@/db/models/FxRate", () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock("@/lib/alpha-vantage-key-resolver", () => ({ resolveAlphaVantageKeys: mocks.keys }));
import { createAlphaVantageClient } from "./alpha-vantage-provider";
const hash = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
// Evaluate the real atomic predicate, not a mock-specific recovery policy.
function matches(row: any, filter: any): boolean {
  return Object.entries(filter).every(([field, condition]: [string, any]) => {
    if (field === "$and") return condition.every((item: any) => matches(row, item));
    if (field === "$or") return condition.some((item: any) => matches(row, item));
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      return Object.entries(condition).every(([op, value]: [string, any]) =>
        op === "$exists" ? (row[field] !== undefined) === value : op === "$lte" ? row[field] <= value : false);
    }
    return row[field] === condition;
  });
}
let now: number;
let states: Map<string, any>;
let counts: Map<string, number>;
const timing = { now: () => now, wait: async (ms: number) => { now += ms; } };
beforeEach(() => {
  vi.resetAllMocks(); now = Date.UTC(2026, 9, 2, 12); states = new Map(); counts = new Map();
  mocks.keys.mockImplementation(async (email) => (email.startsWith("a") ? ["key-A", "key-B"] : ["key-B", "key-A"]).map((key) => ({ key })));
  mocks.state.findOne.mockImplementation(async ({ keyHash }) => states.has(keyHash) ? { ...states.get(keyHash) } : null);
  mocks.state.findOneAndUpdate.mockImplementation(async (filter, update) => {
    const { keyHash } = filter;
    const row = states.get(keyHash) ?? { keyHash };
    states.set(keyHash, row);
    if (update.$setOnInsert) return { ...row };
    if (!matches(row, filter)) return null;
    Object.assign(row, update.$set); return { ...row };
  });
  mocks.state.updateOne.mockImplementation(async (filter, update) => {
    const row = states.get(filter.keyHash);
    if (!row || !matches(row, filter)) return { matchedCount: 0 };
    Object.assign(row, update.$set ?? {});
    for (const field of Object.keys(update.$unset ?? {})) delete row[field];
    return { matchedCount: 1 };
  });
  mocks.counter.findOne.mockImplementation(async ({ apiKey }) => ({ count: counts.get(apiKey) ?? 0, limit: 25 }));
  mocks.counter.findOneAndUpdate.mockImplementation(async ({ apiKey }, update) => {
    if (update.$inc) counts.set(apiKey, (counts.get(apiKey) ?? 0) + 1);
    return { count: counts.get(apiKey) ?? 0, limit: 25 };
  });
  mocks.counter.updateOne.mockResolvedValue({});
});

it.each([false, true])("recovers an abandoned worker after the safety deadline (sent=%s) without refunding unknown attempts", async (sent) => {
  for (const key of ["key-A", "key-B"]) states.set(hash(key), {
    keyHash: hash(key), pendingRequestId: "dead-worker", refreshLockId: "dead-worker",
    refreshLockExpiresAt: new Date(now + 30_000), pendingRequestExpiresAt: new Date(now + 120_000),
  });
  if (sent) counts.set(hash("key-A"), 1);
  const fetcher = vi.fn(async () => Response.json({}));
  const client = await createAlphaVantageClient("b@example.com", fetcher, timing);
  now += 119_999;
  await expect(client.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(fetcher).not.toHaveBeenCalled();
  now += 1;
  await client.request({ function: "SYMBOL_SEARCH" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(counts.get(hash("key-A")) ?? 0).toBe(sent ? 1 : 0);
  expect(counts.get(hash("key-B"))).toBe(1);
  for (const row of states.values()) {
    expect(row.pendingRequestId).toBeUndefined();
    expect(row.pendingRequestExpiresAt).toBeUndefined();
  }
});

it("gives legacy pending guards a one-time safety deadline without extending it on retries", async () => {
  for (const key of ["key-A", "key-B"]) states.set(hash(key), { keyHash: hash(key), pendingRequestId: "legacy" });
  const fetcher = vi.fn(async () => Response.json({}));
  const client = await createAlphaVantageClient("a@example.com", fetcher, timing);
  const start = now;
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(states.get(hash("key-A")).pendingRequestExpiresAt).toEqual(new Date(start + 120_000));
  now += 60_000;
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(states.get(hash("key-A")).pendingRequestExpiresAt).toEqual(new Date(start + 120_000));
  now = start + 120_000;
  expect(states.get(hash("key-B")).pendingRequestExpiresAt).toEqual(new Date(start + 120_000));
  await client.request({ function: "GLOBAL_QUOTE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("fails closed with a safe error when a legacy deadline cannot be saved", async () => {
  states.set(hash("key-A"), { keyHash: hash("key-A"), pendingRequestId: "legacy" });
  mocks.state.updateOne.mockRejectedValue(new Error("private-storage-detail"));
  const fetcher = vi.fn();
  const client = await createAlphaVantageClient("a@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({
    code: "ALPHA_STORAGE", message: expect.not.stringContaining("private-storage-detail"),
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(states.get(hash("key-A")).pendingRequestId).toBe("legacy");
});

it("never replaces a live lease even when its pending deadline has elapsed", async () => {
  states.set(hash("key-B"), { keyHash: hash("key-B"), pendingRequestId: "live", refreshLockId: "live",
    pendingRequestExpiresAt: new Date(now - 1), refreshLockExpiresAt: new Date(now + 30_000) });
  const fetcher = vi.fn();
  await expect((await createAlphaVantageClient("a@example.com", fetcher, timing)).request({ function: "GLOBAL_QUOTE" }))
    .rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(states.get(hash("key-B")).refreshLockId).toBe("live");
  expect(fetcher).not.toHaveBeenCalled();
  expect([...counts.values()]).toEqual([]);
});

it("preserves a known cooldown through deadline expiry and subsequent recovery", async () => {
  const deadline = new Date(now + 120_000), cooldown = new Date(now + 3_600_000);
  states.set(hash("key-A"), { keyHash: hash("key-A"), pendingRequestId: "dead",
    pendingRequestExpiresAt: deadline, cooldownUntil: cooldown, cooldownCode: "ALPHA_RATE_LIMIT_DAILY" });
  const fetcher = vi.fn(async () => Response.json({}));
  const client = await createAlphaVantageClient("b@example.com", fetcher, timing);
  now += 120_000;
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_DAILY", retryAfter: 3480 });
  expect(states.get(hash("key-A")).cooldownUntil).toEqual(cooldown);
  expect(fetcher).not.toHaveBeenCalled();
  now = cooldown.getTime();
  await client.request({ function: "GLOBAL_QUOTE" });
  expect(states.get(hash("key-A")).cooldownUntil).toEqual(cooldown);
  expect(states.get(hash("key-A")).cooldownCode).toBe("ALPHA_RATE_LIMIT_DAILY");
});

it("bounds the durable guard after a failed cooldown write without refunding the attempt", async () => {
  const update = mocks.state.updateOne.getMockImplementation()!;
  mocks.state.updateOne.mockImplementation(async (...args) => {
    if (args[1].$set?.cooldownUntil) throw new Error("database unavailable");
    return update(...args);
  });
  const start = now;
  const firstFetcher = vi.fn(async () => Response.json({ Information: "Daily request limit exhausted." }));
  await expect((await createAlphaVantageClient("a@example.com", firstFetcher, timing)).request({ function: "GLOBAL_QUOTE" }))
    .rejects.toMatchObject({ code: "ALPHA_STORAGE" });
  for (const row of states.values()) expect(row.pendingRequestExpiresAt).toEqual(new Date(start + 120_000));
  const fetcher = vi.fn(async () => Response.json({}));
  const second = await createAlphaVantageClient("b@example.com", fetcher, timing);
  now = start + 119_999;
  await expect(second.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(fetcher).not.toHaveBeenCalled();
  now++;
  await second.request({ function: "SYMBOL_SEARCH" });
  expect(counts.get(hash("key-A"))).toBe(1); expect(counts.get(hash("key-B"))).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("fences late cooldown and cleanup writes from an abandoned worker after recovery", async () => {
  let finish!: (response: Response) => void;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => { started = resolve; });
  const firstFetcher = vi.fn(() => { started(); return new Promise<Response>((resolve) => { finish = resolve; }); });
  const firstOutcome = (await createAlphaVantageClient("a@example.com", firstFetcher, timing))
    .request({ function: "GLOBAL_QUOTE" }).catch((error) => error);
  await sending;
  now += 120_000;
  let finishSecond!: (response: Response) => void;
  let secondStarted!: () => void;
  const secondSending = new Promise<void>((resolve) => { secondStarted = resolve; });
  const secondFetcher = vi.fn(() => { secondStarted(); return new Promise<Response>((resolve) => { finishSecond = resolve; }); });
  const secondOutcome = (await createAlphaVantageClient("b@example.com", secondFetcher, timing))
    .request({ function: "SYMBOL_SEARCH" });
  await secondSending;
  const newOwner = states.get(hash("key-A")).refreshLockId;
  finish(Response.json({ Information: "Daily request limit exhausted." }));
  expect((await firstOutcome).code).toBe("ALPHA_STORAGE");
  for (const row of states.values()) {
    expect(row.refreshLockId).toBe(newOwner); expect(row.pendingRequestId).toBe(newOwner);
    expect(row.cooldownUntil).toBeUndefined();
  }
  finishSecond(Response.json({})); await secondOutcome;
  expect(counts.get(hash("key-A"))).toBe(1); expect(counts.get(hash("key-B"))).toBe(1);
});

it("keeps failed coordination cleanup blocked only until its persisted safety deadline", async () => {
  const update = mocks.state.updateOne.getMockImplementation()!;
  mocks.state.updateOne.mockRejectedValue(new Error("storage unavailable"));
  const start = now;
  const fetcher = vi.fn(async () => Response.json({}));
  await expect((await createAlphaVantageClient("a@example.com", fetcher, timing)).request({ function: "GLOBAL_QUOTE" }))
    .rejects.toMatchObject({ code: "ALPHA_STORAGE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  for (const row of states.values()) expect(row.pendingRequestExpiresAt).toEqual(new Date(start + 120_000));
  mocks.state.updateOne.mockImplementation(update);
  const next = await createAlphaVantageClient("b@example.com", fetcher, timing);
  now = start + 119_999;
  await expect(next.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  now++;
  await next.request({ function: "SYMBOL_SEARCH" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(counts.get(hash("key-A"))).toBe(1); expect(counts.get(hash("key-B"))).toBe(1);
});

it("allows only one caller to recover expired guards across multiple keys", async () => {
  for (const key of ["key-A", "key-B"]) states.set(hash(key), {
    keyHash: hash(key), pendingRequestId: "dead", pendingRequestExpiresAt: new Date(now),
    refreshLockExpiresAt: new Date(now - 1),
  });
  const fetcher = vi.fn(async () => Response.json({}));
  const first = await createAlphaVantageClient("a@example.com", fetcher, timing);
  const second = await createAlphaVantageClient("b@example.com", fetcher, timing);
  const outcomes = await Promise.allSettled([
    first.request({ function: "GLOBAL_QUOTE" }), second.request({ function: "SYMBOL_SEARCH" }),
  ]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect([...counts.values()]).toEqual([1]);
});

it("preserves persisted request spacing when replacing an expired guard", async () => {
  states.set(hash("key-A"), { keyHash: hash("key-A"), pendingRequestId: "dead",
    pendingRequestExpiresAt: new Date(now - 1), lastProviderRequestAt: new Date(now) });
  const start = now;
  const fetcher = vi.fn(async () => Response.json({}));
  await (await createAlphaVantageClient("a@example.com", fetcher, timing)).request({ function: "GLOBAL_QUOTE" });
  expect(now).toBe(start + 1500);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("holds the whole configured key set while a request can establish a provider block", async () => {
  let heldTogether = false;
  const fetcher = vi.fn(async () => {
    const a = states.get(hash("key-A")); const b = states.get(hash("key-B"));
    heldTogether = Boolean(a?.refreshLockId && a.refreshLockId === b?.refreshLockId);
    return Response.json({});
  });
  await (await createAlphaVantageClient("a@example.com", fetcher, timing)).request({ function: "GLOBAL_QUOTE" });
  expect(heldTogether).toBe(true);
});

it("cannot interleave a different-key reservation across a provider block", async () => {
  let finish!: (response: Response) => void;
  let started!: () => void;
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  const firstFetcher = vi.fn(() => { started(); return new Promise<Response>((resolve) => { finish = resolve; }); });
  const first = await createAlphaVantageClient("a@example.com", firstFetcher, timing);
  const firstOutcome = first.request({ function: "GLOBAL_QUOTE" }).catch((error) => error);
  await firstStarted;
  const secondFetcher = vi.fn().mockImplementation(async () => Response.json({}));
  const second = await createAlphaVantageClient("b@example.com", secondFetcher, timing);
  let releaseReservation!: () => void;
  let reserveStarted!: () => void;
  const reserveReached = new Promise<void>((resolve) => { reserveStarted = resolve; });
  const reserve = mocks.counter.findOneAndUpdate.getMockImplementation()!;
  mocks.counter.findOneAndUpdate.mockImplementation(async (...args) => {
    if (args[0].apiKey === hash("key-B") && args[1].$inc) {
      reserveStarted(); await new Promise<void>((resolve) => { releaseReservation = resolve; });
    }
    return reserve(...args);
  });
  const secondOutcome = second.request({ function: "SYMBOL_SEARCH" }).catch((error) => error);
  // New implementation rejects on the shared lease. Old implementation reaches B's reservation.
  await Promise.race([reserveReached, secondOutcome]);
  finish(Response.json({ Information: "Daily request limit exhausted." }));
  expect((await firstOutcome).code).toBe("ALPHA_RATE_LIMIT_DAILY");
  releaseReservation?.();
  const result = await secondOutcome;
  expect(result.code).toMatch(/API_UPDATE_IN_PROGRESS|ALPHA_RATE_LIMIT_DAILY/);
  expect(secondFetcher).not.toHaveBeenCalled(); expect(second.apiCalls).toBe(0);
  expect(counts.get(hash("key-B")) ?? 0).toBe(0);
  const third = await createAlphaVantageClient("b@example.com", secondFetcher, timing);
  await expect(third.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_DAILY" });
  expect(mocks.keys.mock.calls.filter(([, options]) => options.advance)).toHaveLength(1);
});

it("keeps an unresolved cooldown write fail-closed after lease expiry", async () => {
  const update = mocks.state.updateOne.getMockImplementation()!;
  let unblock!: () => void;
  let started!: () => void;
  const saving = new Promise<void>((resolve) => { started = resolve; });
  mocks.state.updateOne.mockImplementation(async (...args) => {
    if (args[1].$set?.cooldownUntil) { started(); await new Promise<void>((resolve) => { unblock = resolve; }); }
    return update(...args);
  });
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ Information: "Daily request limit exhausted." }));
  const first = await createAlphaVantageClient("a@example.com", fetcher, timing);
  const outcome = first.request({ function: "GLOBAL_QUOTE" }).catch((error) => error);
  await saving; now += 30_001;
  const secondFetcher = vi.fn().mockImplementation(async () => Response.json({}));
  const second = await createAlphaVantageClient("b@example.com", secondFetcher, timing);
  const secondOutcome = await second.request({ function: "SYMBOL_SEARCH" }).catch((error) => error);
  unblock();
  expect((await outcome).code).toBe("ALPHA_RATE_LIMIT_DAILY");
  expect(secondOutcome.code).toBe("API_UPDATE_IN_PROGRESS");
  expect(secondFetcher).not.toHaveBeenCalled();
  expect(states.get(hash("key-A")).cooldownCode).toBe("ALPHA_RATE_LIMIT_DAILY");
  expect(counts.get(hash("key-B")) ?? 0).toBe(0);
});

it("releases partial ordered leases when another configured key is on cooldown", async () => {
  const hashes = [hash("key-A"), hash("key-B")].sort();
  states.set(hashes[1], { cooldownUntil: new Date(now + 60_000), cooldownCode: "ALPHA_RATE_LIMIT_UNKNOWN" });
  const fetcher = vi.fn();
  const client = await createAlphaVantageClient("a@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_UNKNOWN" });
  expect(states.get(hashes[0])?.refreshLockId).toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
  expect(mocks.keys.mock.calls.some(([, options]) => options.advance)).toBe(false);
});
