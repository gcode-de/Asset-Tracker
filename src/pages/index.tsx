import AssetList from "@/components/AssetList";
import AssetControls from "@/components/AssetControls";
import Filters from "@/components/Filters";
import Footer from "@/components/Footer";
import TotalValue from "@/components/TotalValue";
import Login from "@/components/Login";
import AssetDialog from "@/components/AssetDialog";
import Prices from "@/components/Prices";
import ApiLimitBadge from "@/components/ApiLimitBadge";
import { refreshOneSymbol } from "@/lib/refresh-http";
import PortfolioOverview from "@/components/PortfolioOverview";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AssetType } from "@/components/Asset";
import { demoAssets, readDemoAssets, writeDemoAssets, DEMO_STORAGE_KEY } from "@/lib/demo";
import useSWR, { mutate } from "swr";
import axios from "axios";
import { useEffect, useState, useRef, FormEvent, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Link from "next/link";
import { AlertCircle, ArrowRight, Database, RotateCcw, WalletCards } from "lucide-react";
import { collectRefreshableSymbols, refreshSymbolsSequentially, summarizeRefreshResults } from "@/lib/price-refresh";

interface UserData {
  _id: string;
  email: string;
  assets: AssetType[];
}

export default function App() {
  const router = useRouter();
  const demoMode = router.isReady && router.query.demo === "true";
  const { toast } = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const [assets, setAssets] = useState<AssetType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Partial<AssetType> | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"value" | "name" | "date">("value");
  const [apiRemaining, setApiRemaining] = useState(25);
  const [isSaving, setIsSaving] = useState(false);
  const [priceRefreshVersion, setPriceRefreshVersion] = useState(0);
  const priceRefreshInFlight = useRef(false);
  const [isPriceRefreshing, setIsPriceRefreshing] = useState(false);
  const [refreshingSymbol, setRefreshingSymbol] = useState<string | null>(null);

  const apiClient = useMemo(
    () => axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } }),
    [],
  );
  const { data: user, error: userError, isLoading } = useSWR<UserData>(router.isReady && !demoMode && sessionStatus === "authenticated" ? "/api/user" : null);

  useEffect(() => {
    if (demoMode) setAssets(readDemoAssets());
  }, [demoMode]);

  useEffect(() => {
    if (!user || demoMode) return;
    let cancelled = false;

    async function loadPrices() {
      try {
        const response = await fetch("/api/prices");
        if (!response.ok) throw new Error("Prices could not be loaded");
        const prices = await response.json();
        if (!Array.isArray(prices)) throw new Error("Unexpected price response");
        const priceMap = new Map(
          prices.map((price) => [String(price.symbol || "").toUpperCase(), { value: price.value, updatedAt: price.recordedAt || price.timestamp }]),
        );
        const merged = user.assets.map((asset) => {
          const price = priceMap.get(String(asset.abb || "").toUpperCase());
          return price
            ? { ...asset, baseValue: price.value, value: (asset.quantity || 0) * price.value, priceUpdatedAt: price.updatedAt }
            : asset;
        });
        if (!cancelled) setAssets(merged);
      } catch {
        if (!cancelled) {
          setAssets(user.assets);
          toast({ title: "Saved assets loaded", description: "Live prices are temporarily unavailable." });
        }
      }
    }

    loadPrices();
    return () => { cancelled = true; };
  }, [demoMode, priceRefreshVersion, toast, user]);

  const updateDemoAssets = (updater: (current: AssetType[]) => AssetType[]) => {
    setAssets((current) => {
      const next = updater(current);
      writeDemoAssets(next);
      return next;
    });
  };

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>, initialValues?: Partial<AssetType> | null) {
    event.preventDefault();
    setIsSaving(true);
    const formProps = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string | number>;
    ["quantity", "value", "baseValue", "costBasis"].forEach((key) => { formProps[key] = Number(formProps[key] || 0); });
    formProps.value = Number(formProps.quantity) * Number(formProps.baseValue);
    const id = initialValues?._id ?? initialValues?.id ?? formProps.id;
    const isEdit = id !== undefined && id !== null && id !== "";

    try {
      if (demoMode) {
        if (isEdit) {
          updateDemoAssets((current) => current.map((asset) => (asset._id === id || asset.id === id ? { ...asset, ...formProps } as AssetType : asset)));
          toast({ title: "Demo asset updated" });
        } else {
          const created = { ...formProps, id: `demo-${Date.now()}`, isDeleted: false } as unknown as AssetType;
          updateDemoAssets((current) => [created, ...current]);
          toast({ title: `${created.name} added to the demo` });
        }
      } else if (isEdit) {
        await apiClient.put("/user?action=update", { id, ...formProps });
        setAssets((current) => current.map((asset) => (asset._id === id || asset.id === id ? { ...asset, ...formProps } as AssetType : asset)));
        toast({ title: "Asset updated" });
      } else {
        const response = await apiClient.post("/user", { ...formProps, userId: user?._id });
        setAssets((current) => [response.data, ...current]);
        toast({ title: `${response.data.name} added` });
      }
      setDialogOpen(false);
      setEditingAsset(null);
    } catch (error) {
      toast({ title: "Asset could not be saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function setDeleted(assetId: string | number, isDeleted: boolean) {
    try {
      if (demoMode) {
        updateDemoAssets((current) => current.map((asset) => (asset._id === assetId || asset.id === assetId ? { ...asset, isDeleted } : asset)));
      } else {
        await apiClient.put(`/user?action=${isDeleted ? "softDelete" : "softUndelete"}`, { id: assetId });
        setAssets((current) => current.map((asset) => (asset._id === assetId || asset.id === assetId ? { ...asset, isDeleted } : asset)));
      }
      toast({ title: isDeleted ? "Asset moved to deleted" : "Asset restored" });
    } catch (error) {
      toast({ title: isDeleted ? "Delete failed" : "Restore failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  function handleEditAsset(id: string | number) {
    setEditingAsset(assets.find((asset) => asset._id === id || asset.id === id) || null);
    setDialogOpen(true);
  }

  function beginPriceRefresh(symbol?: string) {
    // State alone cannot reject competing clicks before the next React render.
    if (priceRefreshInFlight.current) return false;
    priceRefreshInFlight.current = true;
    setIsPriceRefreshing(true);
    setRefreshingSymbol(symbol ?? null);
    return true;
  }

  function endPriceRefresh() {
    priceRefreshInFlight.current = false;
    setIsPriceRefreshing(false);
    setRefreshingSymbol(null);
  }

  async function handleUpdatePrice(symbol: string) {
    if (demoMode) {
      toast({ title: "Demo prices are fixed", description: "The showcase never calls Alpha Vantage." });
      return;
    }
    if (!session) {
      toast({ title: "Sign in to update prices" });
      return;
    }
    if (!beginPriceRefresh(symbol)) return;
    try {
      const result = await refreshOneSymbol(symbol);
      if (typeof result.remainingCalls === "number") setApiRemaining(result.remainingCalls);
      if (!result.ok) throw new Error(result.reason || "No quote available");
      setPriceRefreshVersion((version) => version + 1);
      await Promise.all([mutate("/api/prices"), mutate("/api/user")]);
      toast({ title: `${symbol} updated`, description: `${result.apiCalls} API calls used` });
    } catch (error) {
      toast({ title: `${symbol} could not be updated`, description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      endPriceRefresh();
    }
  }

  function handleAddAsset(prefillType?: string) {
    setEditingAsset(prefillType ? { type: prefillType } : null);
    setDialogOpen(true);
  }

  function handleSearchAndAddAsset(symbol: string, name: string, assetClass?: string) {
    setEditingAsset({ name, abb: symbol, quantity: 0, baseValue: 0, value: 0, type: assetClass || "", notes: "", isDeleted: false });
    setDialogOpen(true);
  }

  async function handleReloadPrices() {
    if (demoMode) {
      toast({ title: "Demo prices refreshed", description: "Using the bundled, deterministic snapshot." });
      return;
    }
    const symbols = collectRefreshableSymbols(assets);
    if (symbols.length === 0) {
      toast({ title: "No refreshable assets", description: "Stocks, ETFs and crypto with a symbol can be updated automatically." });
      return;
    }

    if (!beginPriceRefresh()) return;
    try {
      const results = await refreshSymbolsSequentially({
        symbols,
        refreshSymbol: refreshOneSymbol,
        onResult: (result) => {
          if (typeof result.remainingCalls === "number") setApiRemaining(result.remainingCalls);
          if (result.ok) setPriceRefreshVersion((version) => version + 1);
          toast(
            result.ok
              ? { title: `${result.symbol} updated`, description: `${result.apiCalls} API call${result.apiCalls === 1 ? "" : "s"} used` }
              : { title: `${result.symbol} could not be updated`, description: result.reason || "No quote available", variant: "destructive" },
          );
        },
      });
      setPriceRefreshVersion((version) => version + 1);
      mutate("/api/user");
      const summary = summarizeRefreshResults(results, apiRemaining);
      toast({ title: `${summary.fetched}/${summary.total} assets updated`, description: `${summary.apiCalls ?? "Unknown"} API calls used • ${summary.remainingCalls} app-tracked calls remaining` });
      if (results.length < symbols.length) {
        toast({ title: "Refresh stopped", description: `${symbols.length - results.length} asset${symbols.length - results.length === 1 ? "" : "s"} skipped because the provider is unavailable right now.`, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Prices could not be refreshed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      endPriceRefresh();
    }
  }

  const filteredAssets = assets.filter((asset) => {
    const matchesType = selectedTypes.length ? selectedTypes.includes(asset.type) : true;
    return matchesType && (showDeleted || !asset.isDeleted);
  });

  if (!router.isReady || (!demoMode && (sessionStatus === "loading" || isLoading))) return <LoadingState />;
  if (!demoMode && userError) return <WelcomeState error />;
  if (!demoMode && !user) return <WelcomeState />;

  return (
    <main id="wrapper">
      <header className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          {demoMode ? <div className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Database className="h-4 w-4" />Anonymous local demo</div> : <Login />}
          {demoMode && <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => { window.localStorage.removeItem(DEMO_STORAGE_KEY); setAssets(demoAssets); }}><RotateCcw className="h-4 w-4 mr-2" />Reset demo</Button><Button asChild variant="outline" size="sm"><Link href="/">Exit demo</Link></Button></div>}
        </div>
        <p className="block text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Personal wealth, one clear view</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-2">Asset Tracker</h1>
        <p className="block mt-3 max-w-2xl text-muted-foreground">Track stocks, crypto, metals, property and cash without losing sight of your overall allocation.</p>
      </header>

      <PortfolioOverview assets={assets} />
      <section aria-labelledby="assets-title">
        <div className="flex items-center justify-between gap-4 mb-3"><h2 id="assets-title" className="text-2xl font-bold">Assets</h2><AssetControls handleUpdateValues={handleReloadPrices} onAdd={handleAddAsset} onSearch={handleSearchAndAddAsset} apiRemaining={apiRemaining} demoMode={demoMode} refreshDisabled={isPriceRefreshing} /></div>
        <div className="mb-6"><Filters showDeleted={showDeleted} onToggleDeleted={setShowDeleted} selectedTypes={selectedTypes} onToggleType={(type) => setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} sortBy={sortBy} onSortChange={setSortBy} /></div>
        {filteredAssets.length ? <AssetList assets={filteredAssets} sortBy={sortBy} handleUnDeleteAsset={(id) => setDeleted(id, false)} handleEditAsset={handleEditAsset} handleUpdatePrice={handleUpdatePrice} priceRefreshDisabled={isPriceRefreshing || (!demoMode && apiRemaining <= 0)} refreshingSymbol={refreshingSymbol} /> : <EmptyState hasFilters={selectedTypes.length > 0 || (!showDeleted && assets.some((asset) => asset.isDeleted))} onAdd={() => handleAddAsset()} onClear={() => { setSelectedTypes([]); setShowDeleted(true); }} />}
      </section>

      {!demoMode && <Prices refreshDisabled={isPriceRefreshing} onRefreshStart={beginPriceRefresh} onRefreshEnd={endPriceRefresh} />}
      {!demoMode && <div className="hidden"><ApiLimitBadge onRemainingChange={setApiRemaining} /></div>}
      <Footer><TotalValue value={assets.filter((asset) => !asset.isDeleted).reduce((sum, asset) => sum + (asset.value || 0), 0)} /></Footer>
      <AssetDialog open={dialogOpen} onOpenChange={setDialogOpen} initialValues={editingAsset} onSubmit={handleFormSubmit} onDelete={(id) => setDeleted(id, true)} onCancel={() => { setDialogOpen(false); setEditingAsset(null); }} isSaving={isSaving} />
    </main>
  );
}

function LoadingState() {
  return <main className="min-h-screen grid place-items-center" aria-busy="true"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" /><p className="block mt-4 text-muted-foreground">Loading your portfolio…</p></div></main>;
}

function WelcomeState({ error = false }: { error?: boolean }) {
  return <main className="min-h-screen grid place-items-center px-6 py-16 bg-slate-50"><div className="w-full max-w-2xl text-center"><WalletCards className="mx-auto h-12 w-12" /><p className="block mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Multi-asset portfolio tracking</p><h1 className="mt-3 text-5xl font-extrabold tracking-tight">All your assets.<br />One honest overview.</h1><p className="block mx-auto mt-5 max-w-xl text-lg text-muted-foreground">Explore the product instantly with anonymized, local data. No account, database or market-data quota required.</p>{error && <Alert variant="destructive" className="mt-6 text-left"><AlertCircle className="h-4 w-4" /><AlertTitle>Live account unavailable</AlertTitle><AlertDescription>The server data could not be loaded. The independent demo is still ready.</AlertDescription></Alert>}<div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"><Button asChild size="lg" className="w-full sm:w-auto"><Link href="/?demo=true">Open interactive demo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Login /></div></div></main>;
}

function EmptyState({ hasFilters, onAdd, onClear }: { hasFilters: boolean; onAdd: () => void; onClear: () => void }) {
  return <div className="rounded-xl border border-dashed p-10 text-center mb-8"><WalletCards className="mx-auto h-9 w-9 text-muted-foreground" /><h3 className="mt-4 font-semibold">{hasFilters ? "No assets match these filters" : "Your portfolio is empty"}</h3><p className="block mt-2 text-sm text-muted-foreground">{hasFilters ? "Clear the filters to see the complete portfolio." : "Add your first holding to start tracking its value."}</p><Button className="mt-5" variant={hasFilters ? "outline" : "default"} onClick={hasFilters ? onClear : onAdd}>{hasFilters ? "Clear filters" : "Add first asset"}</Button></div>;
}
