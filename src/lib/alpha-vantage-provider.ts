import crypto from "crypto";
import ApiCounter from "@/db/models/ApiCounter";
import FxRate from "@/db/models/FxRate";
import AlphaVantageState from "@/db/models/AlphaVantageState";
import { resolveAlphaVantageKeys } from "./alpha-vantage-key-resolver";
import { readJsonResponse } from "./refresh-http";

export const PROVIDER_TIMEOUT_MS = 8_000;
export const PROVIDER_LEASE_MS = 30_000;
// Allow dead workers/storage failures to recover, well beyond the lease/timeout.
// An abandoned provider outcome is unknown, not proof that no request was sent.
// This is an app safety bound, not a provider reset: a lost cooldown may cause a
// later caller to encounter another provider block. Durable cooldowns still win.
export const PROVIDER_PENDING_MS = 120_000;
// Conservative app policy, NOT a documented universal free-tier interval.
export const PROVIDER_MIN_INTERVAL_MS = 1_500;
const defaultTiming = { now: () => Date.now(), wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };
const fingerprint = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
const today = (now = Date.now()) => new Date(now).toISOString().split("T")[0];
export class MarketDataError extends Error {
  constructor(public code: string, message: string, public retryAfter?: number) { super(`${code}: ${message}`); }
}

function cooldownError(code: unknown, retryAfter: number) {
  const safeCode = typeof code === "string" && /^ALPHA_RATE_LIMIT_(BURST|DAILY|UNKNOWN)$/.test(code) ? code : "ALPHA_RATE_LIMIT_UNKNOWN";
  return new MarketDataError(safeCode, `App cooldown after a provider block: no request was sent. Try again in ${retryAfter} seconds; this is not a provider reset estimate.`, retryAfter);
}

// Only fixed diagnoses leave the server; never return provider text or credentials.
function providerNotice(data: any): MarketDataError | undefined {
  const text = [data.Note, data.Information].filter((value) => typeof value === "string").join(" ").slice(0, 16_384).toLowerCase();
  if (!text) return undefined;
  if (/(?:exceeded|exhausted|reached|used up)[^.]{0,80}(?:daily|requests? per day)|(?:daily|requests? per day)[^.]{0,80}(?:exceeded|exhausted|reached|used up)/.test(text))
    return new MarketDataError("ALPHA_RATE_LIMIT_DAILY", "Provider reports its daily allowance is exhausted. App counts may differ; the provider reset time is unknown.", 3600);
  if (/spreading out|sparingly|requests? per (second|minute)|requests?\/s(?:ec)?\b|too many requests/.test(text))
    return new MarketDataError("ALPHA_RATE_LIMIT_BURST", "Provider requested slower request spacing. The app has paused requests briefly.", 15);
  if (/premium[- ]only|premium (?:api )?(?:endpoint|function)|(?:endpoint|function)[^.]{0,80}premium|(?:premium|subscription)[^.]{0,80}required/.test(text))
    return new MarketDataError("ALPHA_PLAN", "Provider cannot supply this data on the current plan.");
  if (/rate limit|frequency|(?:request|call)[^.]{0,80}limit|requests per day/.test(text) || data.Note)
    return new MarketDataError("ALPHA_RATE_LIMIT_UNKNOWN", "Provider blocked this request; it did not identify a reliable burst or daily cause. The app has paused requests briefly.", 60);
  if (/premium|subscription|subscribe|paid|plan|entitlement/.test(text))
    return new MarketDataError("ALPHA_PLAN", "Provider cannot supply this data on the current plan.");
  return new MarketDataError("ALPHA_INFO", "Provider did not supply the requested data; the cause is unspecified.");
}

export async function getAlphaVantageQuota(email: string) {
  const keys = await resolveAlphaVantageKeys(email, { advance: false });
  const date = today();
  let count = 0, limit = 0, remaining = 0;
  for (const hash of new Set(keys.map(({ key }) => fingerprint(key)))) {
    const counter = await ApiCounter.findOne({ date, apiKey: hash });
    const used = counter?.count ?? 0, allowance = counter?.limit ?? 25;
    count += used; limit += allowance; remaining += Math.max(0, allowance - used);
  }
  return { date, count, limit, remaining };
}

/** All quote, FX and search attempts use this same atomic daily reservation/lease. */
export async function createAlphaVantageClient(email: string, fetcher: typeof fetch = fetch, timing = defaultTiming) {
  const keys = await resolveAlphaVantageKeys(email, { advance: false });
  const candidates = [...new Map(keys.map((item) => [fingerprint(item.key), item])).entries()];
  let apiCalls = 0;
  return {
    get apiCalls() { return apiCalls; },
    quota: () => getAlphaVantageQuota(email),
    async fxToEUR(from: string): Promise<number> {
      const currency = from.toUpperCase();
      if (currency === "EUR") return 1;
      const cached = await FxRate.findOne({ from: currency, to: "EUR" });
      const age = cached ? Date.now() - new Date(cached.timestamp).getTime() : Infinity;
      if (cached && age >= 0 && age < 3_600_000 && Number.isFinite(cached.rate) && cached.rate > 0) return cached.rate;
      const data = await this.request({ function: "CURRENCY_EXCHANGE_RATE", from_currency: currency, to_currency: "EUR" });
      const rate = Number(data?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"]);
      if (!Number.isFinite(rate) || rate <= 0) throw new MarketDataError("ALPHA_INVALID", "A valid EUR conversion rate is unavailable.");
      await FxRate.findOneAndUpdate({ from: currency, to: "EUR" }, { $set: { rate, timestamp: new Date() } }, { upsert: true, new: true });
      return rate;
    },
    async request(parameters: Record<string, string>): Promise<any> {
      // Read-only fast path except a one-time deadline for legacy pending guards.
      // Initialize every legacy key before rejecting, so retries cannot extend the bound.
      let pending = false;
      for (const [hash] of candidates) {
        const state = await AlphaVantageState.findOne({ keyHash: hash });
        const until = state?.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
        if (until > timing.now()) throw cooldownError(state?.cooldownCode, Math.ceil((until - timing.now()) / 1000));
        if (state?.pendingRequestId && !state.pendingRequestExpiresAt) {
          await AlphaVantageState.updateOne(
            { keyHash: hash, pendingRequestId: state.pendingRequestId, pendingRequestExpiresAt: { $exists: false } },
            { $set: { pendingRequestExpiresAt: new Date(timing.now() + PROVIDER_PENDING_MS) } },
          ).catch(() => { throw new MarketDataError("ALPHA_STORAGE", "Provider recovery deadline could not be saved. Requests remain paused for safety."); });
          pending = true;
        } else if (state?.pendingRequestId && new Date(state.pendingRequestExpiresAt!).getTime() > timing.now()) pending = true;
      }
      if (pending) throw new MarketDataError("API_UPDATE_IN_PROGRESS", "A previous provider outcome is unresolved. Requests are temporarily paused for safety; no new request was sent.");
      const lockId = crypto.randomUUID();
      const held = new Map<string, { state: any; expires: number }>();
      let attemptedHash: string | undefined;
      let retainPending = false;
      const assertLeaseWindow = () => {
        if ([...held.values()].some(({ expires }) => expires <= timing.now() + PROVIDER_TIMEOUT_MS))
          throw new MarketDataError("API_UPDATE_IN_PROGRESS", "Provider lease expired before the request. Try again later.");
      };
      try {
        // Hold the whole configured set in canonical order. A concurrent caller
        // cannot choose another key while this call can establish a provider block.
        for (const [hash] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
          await AlphaVantageState.findOneAndUpdate({ keyHash: hash }, { $setOnInsert: { keyHash: hash } }, { upsert: true, new: true });
          const now = new Date(timing.now()), expires = now.getTime() + PROVIDER_LEASE_MS;
          const state = await AlphaVantageState.findOneAndUpdate(
            { keyHash: hash, $and: [
              { $or: [{ pendingRequestId: { $exists: false } }, { pendingRequestExpiresAt: { $lte: now } }] },
              { $or: [{ refreshLockExpiresAt: { $exists: false } }, { refreshLockExpiresAt: { $lte: now } }] },
              { $or: [{ cooldownUntil: { $exists: false } }, { cooldownUntil: { $lte: now } }] },
            ] },
            // Atomic replacement fences late writes from an abandoned owner. Never
            // clear known cooldown/pacing or refund an unknown reserved attempt.
            { $set: { refreshLockId: lockId, pendingRequestId: lockId, pendingRequestExpiresAt: new Date(now.getTime() + PROVIDER_PENDING_MS), refreshLockExpiresAt: new Date(expires) } }, { new: true },
          );
          if (!state) {
            const latest = await AlphaVantageState.findOne({ keyHash: hash });
            const until = latest?.cooldownUntil ? new Date(latest.cooldownUntil).getTime() : 0;
            if (until > timing.now()) throw cooldownError(latest?.cooldownCode, Math.ceil((until - timing.now()) / 1000));
            throw new MarketDataError("API_UPDATE_IN_PROGRESS", "Another market-data update is in progress. Try again later.");
          }
          held.set(hash, { state, expires });
        }
        assertLeaseWindow();
        const current = await resolveAlphaVantageKeys(email, { advance: false });
        const order = [...new Set(current.map(({ key }) => fingerprint(key)))];
        const ordered = [...candidates].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
        let busy = false;
        for (const [hash, candidate] of ordered) {
          let date = today(timing.now());
          const initial = await ApiCounter.findOne({ date, apiKey: hash });
          if (initial && initial.count >= initial.limit) continue;
          const previous = held.get(hash)!.state.lastProviderRequestAt;
          const last = previous ? new Date(previous).getTime() : 0;
          const delay = last ? Math.max(0, last + PROVIDER_MIN_INTERVAL_MS - timing.now()) : 0;
          if (delay > PROVIDER_MIN_INTERVAL_MS) throw new MarketDataError("API_UPDATE_IN_PROGRESS", "Provider pacing is temporarily unavailable. Try again later.");
          if (delay) await timing.wait(delay);
          assertLeaseWindow();
          date = today(timing.now());
          const counter = await ApiCounter.findOneAndUpdate(
            { date, apiKey: hash }, { $setOnInsert: { date, apiKey: hash, count: 0, limit: 25 } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
          assertLeaseWindow();
          // No cursor write happens while cooldown or another key lease blocks us.
          await resolveAlphaVantageKeys(email, { advance: true });
          assertLeaseWindow();
          const now = new Date(timing.now());
          const locked = await ApiCounter.findOneAndUpdate(
            { date, apiKey: hash, count: { $lt: counter.limit }, $or: [{ refreshLockExpiresAt: { $exists: false } }, { refreshLockExpiresAt: { $lte: now } }] },
            { $inc: { count: 1 }, $set: { refreshLockId: lockId, refreshLockExpiresAt: new Date(now.getTime() + PROVIDER_LEASE_MS), lastProviderRequestAt: now } }, { new: true },
          );
          if (!locked) {
            const latest = await ApiCounter.findOne({ date, apiKey: hash });
            if (latest && latest.count < latest.limit) busy = true;
            continue;
          }
          let attempted = false;
          try {
            // Synchronous AFTER the final awaited DB operation: slow reservation
            // responses cannot cause an outbound call after lease ownership expired.
            assertLeaseWindow();
            const query = new URLSearchParams({ ...parameters, apikey: candidate.key });
            apiCalls++; attempted = true; attemptedHash = hash;
            let response: Response;
            try { response = await fetcher(`https://www.alphavantage.co/query?${query}`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }); }
            catch (error) {
              const timeout = error instanceof Error && /TimeoutError|AbortError/.test(error.name);
              throw new MarketDataError(timeout ? "ALPHA_TIMEOUT" : "ALPHA_NETWORK", timeout ? "Provider request timed out. Please try again." : "Provider could not be reached. Please try again.");
            }
            if (response.status === 429) {
              const header = response.headers.get("retry-after")?.trim() ?? "";
              const seconds = /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - timing.now()) / 1000;
              const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.min(86_400, Math.max(1, Math.ceil(seconds))) : 60;
              throw new MarketDataError("ALPHA_RATE_LIMIT_UNKNOWN", "Provider returned HTTP 429 without a reliable burst or daily diagnosis. The app has paused requests; no automatic retry will be sent.", retryAfter);
            }
            let data: any;
            try { data = await readJsonResponse(response, "Market data provider"); }
            catch (error) { throw new MarketDataError("ALPHA_RESPONSE", error instanceof Error ? error.message : "Provider returned an unusable response."); }
            const notice = providerNotice(data);
            if (notice) throw notice;
            if (data["Error Message"]) throw new MarketDataError("ALPHA_INVALID", "Provider could not find the requested data.");
            return data;
          } catch (error) {
            if (error instanceof MarketDataError && error.code.startsWith("ALPHA_RATE_LIMIT_")) {
              retainPending = true;
              const saved = await AlphaVantageState.updateOne({ keyHash: hash, refreshLockId: lockId, pendingRequestId: lockId }, { $set: {
                cooldownUntil: new Date(timing.now() + (error.retryAfter ?? 60) * 1000), cooldownCode: error.code,
              } }).catch(() => { throw new MarketDataError("ALPHA_STORAGE", "Provider block could not be saved. Requests remain paused for safety."); });
              if (saved.matchedCount !== 1) throw new MarketDataError("ALPHA_STORAGE", "Provider block could not be saved. Requests remain paused for safety.");
              retainPending = false;
            }
            throw error;
          } finally {
            // Undo exactly our reserved increment if no outbound attempt was made.
            // Atomic decrement also preserves concurrent increments after lease expiry.
            if (!attempted) await ApiCounter.updateOne({ date, apiKey: hash, count: { $gte: 1 } }, { $inc: { count: -1 } });
            await ApiCounter.updateOne({ date, apiKey: hash, refreshLockId: lockId }, { $unset: { refreshLockId: 1, refreshLockExpiresAt: 1 } });
          }
        }
        throw new MarketDataError(busy ? "API_UPDATE_IN_PROGRESS" : "API_DAILY_LIMIT", busy ? "Another market-data update is in progress. Try again later." : "App-tracked daily allowance is exhausted for all configured keys.");
      } finally {
        const releases = await Promise.allSettled([...held.keys()].map((hash) => AlphaVantageState.updateOne({ keyHash: hash, refreshLockId: lockId }, {
          // Pace from completion, conservatively avoiding DB/fetch scheduling gaps.
          ...(attemptedHash === hash ? { $set: { lastProviderRequestAt: new Date(timing.now()) } } : {}),
          $unset: { refreshLockId: 1, refreshLockExpiresAt: 1, ...(retainPending ? {} : { pendingRequestId: 1, pendingRequestExpiresAt: 1 }) },
        })));
        if (releases.some((result) => result.status === "rejected")) throw new MarketDataError("ALPHA_STORAGE", "Provider coordination could not be saved. Please try again later.");
      }
    },
  };
}
