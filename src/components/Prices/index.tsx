import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Price {
  symbol: string;
  value: number;
  currency: string;
  source: string;
  recordedAt?: string;
  timestamp?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Prices() {
  const { data: session } = useSession();
  const { data: prices, mutate, error } = useSWR<Price[]>("/api/prices", fetcher);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

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
      toast({ title: `Fetched ${data.fetched} results` });
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
        <div className="mb-4 text-sm text-muted-foreground">Last fetch: {lastFetchTime ? lastFetchTime.toLocaleString() : "never"}</div>
        <Button onClick={onFetchLatest} disabled={!session || saving}>
          {saving ? "Fetching..." : "Fetch latest prices"}
        </Button>
        <Separator className="my-4" />
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
