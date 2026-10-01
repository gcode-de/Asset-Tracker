import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { revalidateApiCounter } from "@/lib/refresh-http";

type KeyMetadata = { id: string; maskedSuffix: string; createdAt: string };

export default function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<KeyMetadata[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadKeys() {
    const response = await fetch("/api/user/alpha-vantage-keys");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load keys");
    setKeys(data.keys || []);
  }

  async function openSettings(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setError("");
    try { await loadKeys(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load keys"); }
  }

  async function addKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/user/alpha-vantage-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add key");
      setKeys((current) => [...current, data.key]);
      setApiKey("");
      revalidateApiCounter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add key");
    } finally {
      setLoading(false);
    }
  }

  async function deleteKey(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/user/alpha-vantage-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete key");
      setKeys(data.keys || []);
      revalidateApiCounter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete key");
    } finally {
      setLoading(false);
    }
  }

  return <Dialog open={open} onOpenChange={openSettings}>
    <Button variant="ghost" size="sm" onClick={() => openSettings(true)} aria-label="Market data keys"><KeyRound className="h-4 w-4 mr-2" />Keys</Button>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Alpha Vantage keys</DialogTitle><DialogDescription>Add up to three private keys. Only their last four characters are shown after saving.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={addKey}>
        <Label htmlFor="alpha-vantage-api-key">Alpha Vantage API key</Label>
        <div className="flex gap-2"><Input id="alpha-vantage-api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={loading || keys.length >= 3} /><Button type="submit" disabled={loading || keys.length >= 3 || !apiKey.trim()}>Add key</Button></div>
      </form>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <ul className="space-y-2" aria-label="Saved Alpha Vantage keys">{keys.map((key) => <li key={key.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm"><span>{key.maskedSuffix}</span><Button type="button" variant="ghost" size="icon" aria-label={`Delete ${key.maskedSuffix}`} disabled={loading} onClick={() => deleteKey(key.id)}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>
    </DialogContent>
  </Dialog>;
}
