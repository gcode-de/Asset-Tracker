import type { AssetType } from "@/components/Asset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const colors: Record<string, string> = {
  stocks: "bg-blue-500",
  crypto: "bg-orange-500",
  metals: "bg-amber-500",
  cash: "bg-emerald-500",
  real_estate: "bg-violet-500",
};

import { currency } from "@/lib/portfolio-ux";

export default function PortfolioOverview({ assets, demoMode = false }: { assets: AssetType[]; demoMode?: boolean }) {
  const active = assets.filter((asset) => !asset.isDeleted);
  const cached = active.filter((asset) => asset.valuationSource === "cached").length;
  const total = active.reduce((sum, asset) => sum + (asset.value || 0), 0);
  const known = active.filter((asset) => typeof asset.costBasis === "number" && Number.isFinite(asset.costBasis) && asset.costBasis >= 0);
  const costBasis = known.reduce((sum, asset) => sum + asset.costBasis!, 0);
  const gain = known.reduce((sum, asset) => sum + (asset.value || 0), 0) - costBasis;
  const gainPercent = costBasis ? (gain / costBasis) * 100 : 0;
  const allocation = Object.entries(
    active.reduce<Record<string, number>>((groups, asset) => {
      groups[asset.type] = (groups[asset.type] || 0) + (asset.value || 0);
      return groups;
    }, {}),
  ).sort(([, a], [, b]) => b - a);

  return (
    <section aria-labelledby="portfolio-overview-title" className="grid gap-4 md:grid-cols-[1fr_1.5fr] mb-8">
      <Card className="bg-slate-950 text-white border-slate-950">
        <CardHeader>
          <CardTitle id="portfolio-overview-title" className="text-sm font-medium text-slate-300">
            Estimated portfolio value · EUR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="block text-3xl font-bold tracking-tight">{currency.format(total)}</p>
          <details className="mt-2"><summary className="text-sm cursor-pointer">Valuation and performance context</summary><p className="block mt-2 text-sm text-slate-300">{demoMode ? "Fixed demo snapshot · local edits only, no live prices" : `${cached} cached · ${active.length - cached} manual/saved valuations · mixed ages, not live`}. Overall active portfolio, independent of filters.</p></details>
          <p className={`mt-2 text-sm ${gain >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {known.length ? <>{gain >= 0 ? "+" : ""}{currency.format(gain)} {costBasis ? `(${gainPercent >= 0 ? "+" : ""}${gainPercent.toFixed(1)}%)` : "(percentage unavailable for zero basis)"} vs. cost basis</> : "Performance unavailable — add cost basis"}
          </p>
          {known.length > 0 && <p className="block mt-1 text-sm text-slate-300">{known.length} of {active.length} holdings with known cost basis. Not a time-period return.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Allocation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {allocation.map(([type, value]) => (
              <span key={type} className={colors[type] || "bg-slate-500"} style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm" aria-label="Portfolio allocation">
            {allocation.map(([type, value]) => (
              <li key={type} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 capitalize"><span className={`h-2.5 w-2.5 rounded-full ${colors[type] || "bg-slate-500"}`} />{type.replace("_", " ")}</span>
                <span className="font-medium">{total ? ((value / total) * 100).toFixed(0) : 0}%</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
