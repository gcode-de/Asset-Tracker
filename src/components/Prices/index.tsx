import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import ApiLimitBadge from "@/components/ApiLimitBadge";
import { refreshOneSymbol } from "@/lib/refresh-http";
import { AlertCircle, Clock, RotateCcw } from "lucide-react";
import { collectRefreshableSymbols, refreshSymbolsSequentially, summarizeRefreshResults } from "@/lib/price-refresh";

interface Price {
  symbol: string;
  value: number;
  currency: string;
  source: string;
  recordedAt?: string;
  timestamp?: string;
}

interface FetchResultItem {
  symbol: string;
  ok: boolean;
  reason?: string;
}

interface FetchSummary {
  fetched: number;
  total: number;
  apiCalls: number | null;
  remainingCalls: number;
  results: FetchResultItem[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Prices({ refreshDisabled = false, onRefreshStart, onRefreshEnd }: { refreshDisabled?: boolean; onRefreshStart?: () => boolean; onRefreshEnd?: () => void }) {
  const { data: session } = useSession();
  const { data: prices, mutate, error } = useSWR<Price[]>("/api/prices", fetcher);
  const { data: user } = useSWR(session ? "/api/user" : null, fetcher);
  const [saving, setSaving] = useState(false);
  const refreshInFlight = useRef(false);
  const { toast } = useToast();
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<string>("Never");
  const [remaining, setRemaining] = useState<number>(25);
  const [lastSummary, setLastSummary] = useState<FetchSummary | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [refreshProgress, setRefreshProgress] = useState<{ completed: number; total: number; symbol?: string } | null>(null);

  const userSymbols = useMemo(() => {
    if (!user || !Array.isArray(user.assets)) return new Set<string>();
    return new Set(
      user.assets
        .filter((a: any) => !a.isDeleted)
        .map((a: any) => (a.abb || a.name || a.id || "").toString().toUpperCase())
        .filter(Boolean)
    );
  }, [user]);

  const filteredPrices = useMemo(() => {
    if (!prices) return [];
    return prices.filter((p) => userSymbols.has(p.symbol.toUpperCase()));
  }, [prices, userSymbols]);

  const refreshableSymbols = useMemo(() => {
    const lastUpdatedBySymbol = new Map(
      (prices || []).map((price) => [price.symbol.toUpperCase(), new Date(price.recordedAt || price.timestamp || 0)]),
    );
    return collectRefreshableSymbols(Array.isArray(user?.assets) ? user.assets : [], lastUpdatedBySymbol);
  }, [prices, user]);

  const lastFetchTime = useMemo(() => {
    if (!filteredPrices || filteredPrices.length === 0) return null;
    const times = filteredPrices.map((p) => new Date(p.recordedAt || p.timestamp || 0));
    const max = new Date(
      Math.max.apply(
        null,
        times.map((t) => t.getTime())
      )
    );
    return max;
  }, [filteredPrices]);

  // Update "time since" display every minute
  useEffect(() => {
    const updateTimeSince = () => {
      if (!lastFetchTime) {
        setTimeSinceUpdate("Never");
        return;
      }

      const now = new Date();
      const diff = now.getTime() - lastFetchTime.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (minutes < 1) {
        setTimeSinceUpdate("Just now");
      } else if (minutes < 60) {
        setTimeSinceUpdate(`${minutes}m ago`);
      } else if (hours < 24) {
        setTimeSinceUpdate(`${hours}h ago`);
      } else {
        setTimeSinceUpdate(`${days}d ago`);
      }
    };

    updateTimeSince();
    const interval = setInterval(updateTimeSince, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [lastFetchTime]);

  const fetchOnePrice = refreshOneSymbol;

  const onFetchLatest = async () => {
    if (!session) {
      toast({ title: "Sign in to fetch prices" });
      return;
    }
    if (refreshableSymbols.length === 0) {
      toast({ title: "No refreshable assets", description: "Stocks, ETFs and crypto with a symbol can be updated automatically." });
      return;
    }

    if (refreshInFlight.current || (onRefreshStart && !onRefreshStart())) return;
    refreshInFlight.current = true;
    try {
      setSaving(true);
      setRefreshProgress({ completed: 0, total: refreshableSymbols.length });
      const results = await refreshSymbolsSequentially({
        symbols: refreshableSymbols,
        refreshSymbol: (symbol) => { setRefreshProgress((progress) => progress ? { ...progress, symbol } : null); return fetchOnePrice(symbol); },
        onResult: async (result, index, total) => {
          setRefreshProgress({ completed: index + 1, total, symbol: result.symbol });
          if (typeof result.remainingCalls === "number") setRemaining(result.remainingCalls);
          toast(
            result.ok
              ? { title: `${result.symbol} updated`, description: `${result.apiCalls} API call${result.apiCalls === 1 ? "" : "s"} used` }
              : { title: `${result.symbol} could not be updated`, description: result.reason || "No quote available", variant: "destructive" },
          );
          await mutate();
        },
      });

      setLastSummary({
        ...summarizeRefreshResults(results, remaining),
        results: results.map((result) => ({ symbol: result.symbol, ok: result.ok, reason: result.reason })),
      });
      if (results.length < refreshableSymbols.length) {
        toast({ title: "Refresh stopped", description: `${refreshableSymbols.length - results.length} asset${refreshableSymbols.length - results.length === 1 ? "" : "s"} skipped because the provider is unavailable right now.`, variant: "destructive" });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: message, variant: "destructive" });
    } finally {
      refreshInFlight.current = false;
      onRefreshEnd?.();
      setSaving(false);
      setRefreshProgress(null);
      mutate();
    }
  };

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle>Prices</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><AlertCircle className="h-4 w-4 mt-0.5" />Prices could not be loaded. Your saved holdings are unaffected.</div>}
        {!prices && !error && <div className="mb-4 space-y-2" aria-busy="true" aria-label="Loading prices"><div className="h-4 w-1/3 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /></div>}
        <div className="mb-6 space-y-4">
          {/* API Limit Badge */}
          <ApiLimitBadge onRemainingChange={setRemaining} />

          {/* Last Updated Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-900">Last Updated</span>
            </div>
            <div className="text-sm text-blue-800">
              {lastFetchTime ? (
                <>
                  <div className="font-medium">{timeSinceUpdate}</div>
                  <div className="text-xs opacity-75">{lastFetchTime.toLocaleString("de-DE")}</div>
                </>
              ) : (
                <div className="italic">No prices fetched yet</div>
              )}
            </div>
          </div>
        </div>
        <Button onClick={onFetchLatest} disabled={!session || saving || refreshDisabled || remaining <= 0} className="w-full">
          {saving ? (
            refreshProgress ? (
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 animate-spin" />
                Updating {refreshProgress.symbol ? `${refreshProgress.symbol} ` : ""}({refreshProgress.completed}/{refreshProgress.total})
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 animate-spin" />
                Fetching prices...
              </span>
            )
          ) : (
            "Fetch latest prices"
          )}
        </Button>
        <Separator className="my-4" />
        {lastSummary && (
          <div className="mb-4 p-3 border rounded-md bg-muted/20">
            <div className="text-sm mb-2">
              <span className="font-medium">Last Fetch:</span> {lastSummary.fetched}/{lastSummary.total} updated • {lastSummary.apiCalls ?? "Unknown"} calls •{" "}
              {lastSummary.remainingCalls} remaining
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? "Hide details" : "Show details"}
            </Button>
            {showDetails && (
              <div className="mt-3 max-h-48 overflow-y-auto text-sm">
                {lastSummary.results.length === 0 ? (
                  <div className="text-muted-foreground">No result details.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lastSummary.results.map((r) => (
                        <TableRow key={`${r.symbol}-${r.ok}-${r.reason ?? ""}`}>
                          <TableCell>{r.symbol}</TableCell>
                          <TableCell>{r.ok ? "ok" : "failed"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.reason || ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        )}
        {Array.isArray(prices) && filteredPrices.length === 0 && !error && <p className="block py-6 text-center text-sm text-muted-foreground">No cached market prices for this portfolio yet.</p>}
        {Array.isArray(filteredPrices) && filteredPrices.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPrices.map((p) => (
                <TableRow key={p.symbol}>
                  <TableCell>{p.symbol}</TableCell>
                  <TableCell className="text-right">{Number(p.value).toLocaleString("de-DE")}</TableCell>
                  <TableCell>{p.currency}</TableCell>
                  <TableCell>{p.source}</TableCell>
                  <TableCell>{new Date(p.recordedAt || p.timestamp || 0).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
}
