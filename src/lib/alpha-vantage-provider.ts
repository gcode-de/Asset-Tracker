import crypto from "crypto";
import ApiCounter from "@/db/models/ApiCounter";
import FxRate from "@/db/models/FxRate";
import { resolveAlphaVantageKeys } from "./alpha-vantage-key-resolver";
import { readJsonResponse } from "./refresh-http";

export const PROVIDER_TIMEOUT_MS = 8_000;
export const PROVIDER_LEASE_MS = 30_000;
const fingerprint = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
const today = () => new Date().toISOString().split("T")[0];
export class MarketDataError extends Error {
  constructor(public code: string, message: string) { super(`${code}: ${message}`); }
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
export async function createAlphaVantageClient(email: string, fetcher: typeof fetch = fetch) {
  const keys = await resolveAlphaVantageKeys(email, { advance: true });
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
      const date = today();
      let busy = false;
      for (const [hash, candidate] of candidates) {
        const initial = await ApiCounter.findOne({ date, apiKey: hash });
        if (initial && initial.count >= initial.limit) continue;
        // Upsert only initializes a missing row. Atomic reservation remains authoritative.
        const counter = await ApiCounter.findOneAndUpdate(
          { date, apiKey: hash }, { $setOnInsert: { date, apiKey: hash, count: 0, limit: 25 } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        const lockId = crypto.randomUUID();
        const now = new Date();
        const locked = await ApiCounter.findOneAndUpdate(
          { date, apiKey: hash, count: { $lt: counter.limit }, $or: [{ refreshLockExpiresAt: { $exists: false } }, { refreshLockExpiresAt: { $lte: now } }] },
          { $inc: { count: 1 }, $set: { refreshLockId: lockId, refreshLockExpiresAt: new Date(now.getTime() + PROVIDER_LEASE_MS), lastProviderRequestAt: now } },
          { new: true },
        );
        if (!locked) {
          const latest = await ApiCounter.findOne({ date, apiKey: hash });
          if (latest && latest.count < latest.limit) busy = true;
          continue;
        }
        apiCalls++;
        try {
          // Support FAQ documents 25/day, not a 5/minute rule (checked 2026-10-01).
          // No fixed sleep: sequential clients + persistent key lease serialize calls.
          const query = new URLSearchParams({ ...parameters, apikey: candidate.key });
          let response: Response;
          try { response = await fetcher(`https://www.alphavantage.co/query?${query}`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }); }
          catch (error) {
            const timeout = error instanceof Error && /TimeoutError|AbortError/.test(error.name);
            throw new MarketDataError(timeout ? "ALPHA_TIMEOUT" : "ALPHA_NETWORK", timeout ? "Provider request timed out. Please try again." : "Provider could not be reached. Please try again.");
          }
          if (response.status === 429) throw new MarketDataError("ALPHA_RATE_LIMIT", "Provider request limit reached. Try again later.");
          let data: any;
          try { data = await readJsonResponse(response, "Market data provider"); }
          catch (error) { throw new MarketDataError("ALPHA_RESPONSE", error instanceof Error ? error.message : "Provider returned an unusable response."); }
          if (data.Note || (data.Information && /limit|frequency|rate|requests per day/i.test(String(data.Information)))) throw new MarketDataError("ALPHA_RATE_LIMIT", "Provider request limit reached. Try again later.");
          if (data.Information) throw new MarketDataError("ALPHA_INFO", "Provider cannot supply this data on the current plan.");
          if (data["Error Message"]) throw new MarketDataError("ALPHA_INVALID", "Provider could not find the requested data.");
          return data;
        } finally {
          await ApiCounter.updateOne({ date, apiKey: hash, refreshLockId: lockId }, { $unset: { refreshLockId: 1, refreshLockExpiresAt: 1 } });
        }
      }
      throw new MarketDataError(busy ? "API_UPDATE_IN_PROGRESS" : "API_DAILY_LIMIT", busy ? "Another market-data update is in progress. Try again later." : "App-tracked daily allowance is exhausted for all configured keys.");
    },
  };
}
