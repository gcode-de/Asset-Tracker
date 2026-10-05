import useSWR from "swr";
import type { AssetType } from "@/components/Asset";

export interface UserData {
  _id: string;
  email: string;
  assets: AssetType[];
}

export interface CachedPrice {
  symbol: string;
  value: number;
  currency?: string;
  source?: string;
  recordedAt?: string;
  timestamp?: string;
}

async function readUser([url, email]: [string, string]): Promise<UserData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Saved holdings could not be loaded");
  const user = await response.json();
  if (!user || user.email !== email || !Array.isArray(user.assets)) throw new Error("Unexpected holdings response");
  return user;
}

async function readPrices([url]: [string, string]): Promise<CachedPrice[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Cached prices could not be loaded");
  const prices = await response.json();
  if (!Array.isArray(prices)) throw new Error("Unexpected price response");
  return prices;
}

// Both reads start together; all subscribers share the same SWR cache.
export function usePortfolioData(email: string | null) {
  const user = useSWR<UserData>(email ? ["/api/user", email] : null, readUser);
  const prices = useSWR<CachedPrice[]>(email ? ["/api/prices", email] : null, readPrices);
  return { user, prices };
}
