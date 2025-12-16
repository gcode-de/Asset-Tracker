import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import ApiLimitBadge from "@/components/ApiLimitBadge";
import { Clock, RotateCcw } from "lucide-react";

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
  apiCalls: number;
  remainingCalls: number;
  results: FetchResultItem[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Prices() {
  const { data: session } = useSession();
  const { data: prices, mutate, error } = useSWR<Price[]>("/api/prices", fetcher);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<string>("Never");
  const [remaining, setRemaining] = useState<number>(25);
  const [lastSummary, setLastSummary] = useState<FetchSummary | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const lastFetchTime = useMemo(() => {
    if (!prices || prices.length === 0) return null;
    const times = prices.map((p) => new Date(p.recordedAt || p.timestamp || 0));
    const max = new Date(
      Math.max.apply(
        null,
        times.map((t) => t.getTime())
      )
    );
    return max;
  }, [prices]);

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

  const onFetchLatest = async () => {
    if (!session) {
      toast({ title: "Sign in to fetch prices" });
      return;
    }
    try {
      setSaving(true);
      const resp = await fetch("/api/prices/fetch", { method: "POST", credentials: "same-origin" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Fetch failed");

      if (resp.status === 429) {
        toast({
          title: "API Limit Reached",
          description: "Free tier is limited to 25 calls per day",
          variant: "destructive",
        });
      } else {
        toast({
          title: `Fetched ${data.fetched} price${data.fetched !== 1 ? "s" : ""}`,
          description: `${data.apiCalls} API calls • ${data.remainingCalls} calls remaining today`,
        });
      }
      // Store last results for diagnostics
      setLastSummary({
        fetched: data.fetched,
        total: data.total,
        apiCalls: data.apiCalls,
        remainingCalls: data.remainingCalls,
        results: Array.isArray(data.results) ? data.results.map((r: any) => ({ symbol: r.symbol, ok: !!r.ok, reason: r.reason })) : [],
      });
      await mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: message, variant: "destructive" });
    } finally {
      setSaving(false);
      mutate();
    }
  };

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle>Prices</CardTitle>
      </CardHeader>
      <CardContent>
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
        <Button onClick={onFetchLatest} disabled={!session || saving || remaining <= 0} className="w-full">
          {saving ? (
            lastSummary && lastSummary.total > 0 ? (
              <span className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 animate-spin" />
                Fetching assets... (0/{lastSummary.total})
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
              <span className="font-medium">Last Fetch:</span> {lastSummary.fetched}/{lastSummary.total} updated • {lastSummary.apiCalls} calls •{" "}
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
        {Array.isArray(prices) && prices.length > 0 && (
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
              {prices.map((p) => (
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
