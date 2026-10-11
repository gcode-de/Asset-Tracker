import type { AssetType } from "@/components/Asset";
import { isRefreshableAsset, preciousMetalSymbol } from "./price-refresh";

export function formatTime(value?: string | Date): string {
  const time = value ? new Date(value) : null;
  return time && Number.isFinite(time.getTime()) ? time.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "unknown";
}
export function valuationLabel(asset: AssetType, demo = false): string {
  if (demo) return `Fixed demo snapshot · saved ${formatTime(asset.priceUpdatedAt)}`;
  if (asset.valuationSource === "cached") return `Cached quote · quote time ${formatTime(asset.quoteTimestamp)} · saved ${formatTime(asset.priceUpdatedAt)}`;
  if (asset.priceUpdatedAt) return `Saved valuation · ${formatTime(asset.priceUpdatedAt)} · quote time unknown`;
  return "Manual valuation · saved estimate, not a live quote";
}
export function refreshGuidance(type: string, abb: string): string {
  const asset = { type, abb };
  if (preciousMetalSymbol(asset)) return "Supported gold/silver spot refresh uses EUR per troy ounce. Quantities are troy ounces, not grams; no automatic conversion.";
  if (isRefreshableAsset(asset)) return abb.trim() ? "Automatic updates supported; the provider must recognize this ticker or crypto code." : "Enter a valid ticker or crypto code for reliable automatic updates; a name alone may not resolve.";
  if (["metal", "metals", "precious_metal"].includes(type)) return "Manual valuation for this symbol. Supported metal symbols: XAU, XAG, XAUUSD, XAGUSD only. GOLD/SILVER are not safe spot identities.";
  return "Manual valuation. Cash and property use your saved estimates; no automatic market-price updates.";
}
export const refreshableCopy = "Stocks, ETFs, crypto and supported gold/silver (XAU, XAG, XAUUSD, XAGUSD) can be updated automatically.";

export function parseCostBasis(value: unknown): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Cost basis must be a nonnegative number or blank");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Cost basis must be a nonnegative number or blank");
  return amount;
}
export const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
