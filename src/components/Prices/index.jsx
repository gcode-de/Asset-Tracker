import React, { useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function Prices() {
  const { data: session } = useSession();
  const { data: prices, mutate, error } = useSWR("/api/prices", fetcher);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const lastFetchTime = React.useMemo(() => {
    if (!prices || prices.length === 0) return null;
    const times = prices.map((p) => new Date(p.recordedAt || p.timestamp));
    const max = new Date(Math.max.apply(null, times));
    return max;
  }, [prices]);

  const onFetchLatest = async () => {
    setMsg(null);
    if (!session) {
      setMsg("Sign in to fetch prices");
      return;
    }
    try {
      setSaving(true);
      const resp = await fetch("/api/prices/fetch", { method: "POST", credentials: "same-origin" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Fetch failed");
      setMsg(`Fetched ${data.fetched} results`);
      await mutate();
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setSaving(false);
      mutate();
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-2">Prices</h2>
      <div className="mb-4 text-sm text-gray-600">Last fetch: {lastFetchTime ? lastFetchTime.toLocaleString() : "never"}</div>
      <button onClick={onFetchLatest} disabled={!session || saving} className="ml-2 px-3 py-1 border rounded">
        {saving ? "Fetching..." : "Fetch latest prices"}
      </button>

      {msg && <div className="mb-4 text-sm text-green-600">{msg}</div>}
    </div>
  );
}
