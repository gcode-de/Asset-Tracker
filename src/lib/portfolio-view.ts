import type { AssetType } from "@/components/Asset";
import type { ParsedUrlQuery } from "querystring";
export type PortfolioView = { types: string[]; sort: "value" | "name" | "date"; deleted: boolean; view: "list" | "cards" };
const allowedTypes = new Set(["cash", "crypto", "metals", "stocks", "real_estate"]);
export function readPortfolioView(query: ParsedUrlQuery): PortfolioView {
  return { types: typeof query.types === "string" ? [...new Set(query.types.split(",").filter(type => allowedTypes.has(type)))] : [], sort: query.sort === "date" || query.sort === "name" ? query.sort : "value", deleted: query.deleted === "true", view: query.view === "cards" ? "cards" : "list" };
}
export function portfolioViewQuery(query: ParsedUrlQuery, state: PortfolioView): ParsedUrlQuery {
  const next = { ...query };
  for (const key of ["types", "sort", "deleted", "view"]) delete next[key];
  if (state.types.length) next.types = state.types.filter(type => allowedTypes.has(type)).join(",");
  if (state.sort !== "value") next.sort = state.sort;
  if (state.deleted) next.deleted = "true";
  if (state.view !== "list") next.view = state.view;
  return next;
}
export function sortHoldings(assets: AssetType[], sort: PortfolioView["sort"]): AssetType[] {
  const time = (asset: AssetType) => { const parsed = asset.createdAt ? Date.parse(asset.createdAt) : NaN; return Number.isFinite(parsed) ? parsed : -Infinity; };
  return [...assets].sort((a, b) => sort === "value" ? (b.value || 0) - (a.value || 0) : sort === "name" ? a.name.localeCompare(b.name) : time(a) === time(b) ? 0 : time(b) > time(a) ? 1 : -1);
}
