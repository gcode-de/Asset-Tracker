import { parseCostBasis, refreshableCopy } from "@/lib/portfolio-ux";
import { readPortfolioView, portfolioViewQuery, type PortfolioView } from "@/lib/portfolio-view";
import { ToastAction } from "@/components/ui/toast";
import AssetList from "@/components/AssetList";
import AssetControls from "@/components/AssetControls";
import Filters from "@/components/Filters";
import Footer from "@/components/Footer";
import TotalValue from "@/components/TotalValue";
import Login from "@/components/Login";
import AssetDialog from "@/components/AssetDialog";
import Prices from "@/components/Prices";
import { refreshOneSymbol } from "@/lib/refresh-http";
import PortfolioOverview from "@/components/PortfolioOverview";
import PortfolioLoading from "@/components/PortfolioLoading";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AssetType } from "@/components/Asset";
import { demoAssets, readDemoAssets, writeDemoAssets, DEMO_STORAGE_KEY } from "@/lib/demo";
import { usePortfolioData, type CachedPrice } from "@/hooks/use-portfolio-data";
import axios from "axios";
import { useEffect, useState, useRef, FormEvent, useMemo, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { AlertCircle, ArrowRight, Database, RotateCcw, WalletCards } from "lucide-react";
import { collectRefreshableSymbols, refreshSymbolsSequentially, summarizeRefreshResults } from "@/lib/price-refresh";

function mergeCachedPrices(holdings: AssetType[], prices?: CachedPrice[]) {
  if (!prices) return holdings;
  const priceMap = new Map(prices.map((price) => [price.symbol.toUpperCase(), price]));
  return holdings.map((asset) => {
    const price = priceMap.get(String(asset.abb || "").toUpperCase());
    return price ? { ...asset, baseValue: price.value, value: (asset.quantity || 0) * price.value, priceUpdatedAt: price.recordedAt, quoteTimestamp: price.timestamp, valuationSource: "cached" as const } : asset;
  });
}

export default function App() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const demoMode = router.isReady && router.query.demo === "true";
  // Remount all local holdings, dialogs and pending refresh state on identity changes.
  const identity = demoMode ? "demo" : status === "authenticated" ? session?.user?.email : status;
  return <><Head><title>{demoMode ? "Asset Tracker — Demo" : "Asset Tracker — Portfolio"}</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head><a className="skip-link" href="#assets-title">Skip to assets</a><PortfolioApp key={identity} identity={identity} /></>;
}

function PortfolioApp({ identity }: { identity: string | null | undefined }) {
  const router = useRouter();
  const demoMode = router.isReady && router.query.demo === "true";
  const { toast } = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const originIdentity = useRef(identity);
  const mounted = useRef(true);
  const undoToast = useRef<{ dismiss: () => void } | undefined>(undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; undoToast.current?.dismiss(); }; }, []);
  const [localAssets, setLocalAssets] = useState<{ assets: AssetType[]; priceSnapshot?: CachedPrice[] } | null>(null);
  const dialogOrigin = useRef<HTMLElement | null>(null);
  const captureDialogOrigin = () => { dialogOrigin.current = document.activeElement as HTMLElement; };
  const restoreDialogOrigin = () => {
    const origin = dialogOrigin.current;
    const target = origin?.isConnected ? origin : origin?.id ? document.getElementById(origin.id) : null;
    (target ?? document.getElementById("assets-title"))?.focus();
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Partial<AssetType> | null>(null);
  const viewState = readPortfolioView(router.query);
  const { deleted: showDeleted, types: selectedTypes, sort: sortBy, view } = viewState;
  const changeView = (update: Partial<PortfolioView>) => { void router.push({ pathname: router.pathname, query: portfolioViewQuery(router.query, { ...viewState, ...update }) }, undefined, { shallow: true, scroll: false }); };
  const setShowDeleted = (deleted: boolean) => changeView({ deleted });
  const setSelectedTypes = (update: string[] | ((current: string[]) => string[])) => changeView({ types: typeof update === "function" ? update(selectedTypes) : update });
  const setSortBy = (sort: PortfolioView["sort"]) => changeView({ sort });
  const setView = (view: PortfolioView["view"]) => changeView({ view });
  const [apiRemaining, setApiRemaining] = useState<number | null>(null);
  const [refreshStatus, setRefreshStatus] = useState("Ready to update market prices. Manual valuations are unchanged.");
  const [isSaving, setIsSaving] = useState(false);
  const priceRefreshInFlight = useRef(false);
  const [isPriceRefreshing, setIsPriceRefreshing] = useState(false);
  const [refreshingSymbol, setRefreshingSymbol] = useState<string | null>(null);

  const apiClient = useMemo(
    () => axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } }),
    [],
  );
  const portfolio = usePortfolioData(router.isReady && !demoMode && sessionStatus === "authenticated" ? session?.user?.email ?? null : null);
  const { data: user, error: userError, mutate: revalidateUser } = portfolio.user;
  const { data: prices, error: pricesError, mutate: revalidatePrices } = portfolio.prices;
  const assets = useMemo(() => {
    const holdings = demoMode ? localAssets?.assets ?? [] : user?.assets ?? [];
    // A saved manual price wins over the pre-save quote only until the next
    // authoritative holdings/price snapshot. Never mask later server holdings.
    if (demoMode || !prices || (localAssets?.assets === holdings && localAssets.priceSnapshot === prices)) return holdings;
    return mergeCachedPrices(holdings, prices);
  }, [demoMode, user, localAssets, prices]);

  // A bound cache mutation fences reads started before this successful CRUD.
  // Future reads remain authoritative, and Prices sees the same holdings as cards.
  const setAssets = (update: AssetType[] | ((current: AssetType[]) => AssetType[])) => {
    if (demoMode) {
      setLocalAssets((current) => ({ assets: typeof update === "function" ? update(current?.assets ?? []) : update }));
      return;
    }
    void revalidateUser((current) => {
      if (!current) return current;
      const holdings = localAssets?.assets === current.assets && localAssets.priceSnapshot === prices
        ? current.assets : mergeCachedPrices(current.assets, prices);
      const next = typeof update === "function" ? update(holdings) : update;
      setLocalAssets({ assets: next, priceSnapshot: prices });
      return { ...current, assets: next };
    }, { revalidate: false });
  };

  useEffect(() => {
    if (demoMode) setLocalAssets({ assets: readDemoAssets() });
  }, [demoMode]);

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
    const formProps = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string | number | null>;
    formProps.costBasis = parseCostBasis(formProps.costBasis);
    ["quantity", "value", "baseValue"].forEach((key) => { formProps[key] = Number(formProps[key] || 0); });
    formProps.value = Number(formProps.quantity) * Number(formProps.baseValue);
    if (initialValues && Number(formProps.baseValue) !== initialValues.baseValue) {
      formProps.valuationSource = "manual";
      formProps.quoteTimestamp = null;
      formProps.priceUpdatedAt = null;
    }
    const id = initialValues?._id ?? initialValues?.id ?? formProps.id;
    const isEdit = id !== undefined && id !== null && id !== "";

    try {
      if (demoMode) {
        if (isEdit) {
          updateDemoAssets((current) => current.map((asset) => (asset._id === id || asset.id === id ? { ...asset, ...formProps } as AssetType : asset)));
          toast({ title: "Demo asset updated" });
        } else {
          const created = { ...formProps, id: `demo-${Date.now()}`, createdAt: new Date().toISOString(), isDeleted: false } as unknown as AssetType;
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
    const isOrigin = () => mounted.current && originIdentity.current === (demoMode ? "demo" : session?.user?.email);
    if (!isOrigin()) return false;
    try {
      if (demoMode) {
        updateDemoAssets((current) => current.map((asset) => (asset._id === assetId || asset.id === assetId ? { ...asset, isDeleted } : asset)));
      } else {
        await apiClient.put(`/user?action=${isDeleted ? "softDelete" : "softUndelete"}`, { id: assetId });
        if (!isOrigin()) return false;
        setAssets((current) => current.map((asset) => (asset._id === assetId || asset.id === assetId ? { ...asset, isDeleted } : asset)));
      }
      if (!isOrigin()) return false;
      undoToast.current = toast({ title: isDeleted ? "Asset moved to deleted" : "Asset restored", action: isDeleted ? <ToastAction altText="Restore deleted asset" onClick={() => { void setDeleted(assetId, false); }}>Undo</ToastAction> : undefined });
      return true;
    } catch (error) {
      if (!isOrigin()) return false;
      toast({ title: isDeleted ? "Delete failed" : "Restore failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      return false;
    }
  }

  function handleEditAsset(id: string | number) {
    captureDialogOrigin();
    setEditingAsset(assets.find((asset) => asset._id === id || asset.id === id) || null);
    setDialogOpen(true);
  }

  function beginPriceRefresh(symbol?: string) {
    // State alone cannot reject competing clicks before the next React render.
    if (priceRefreshInFlight.current) return false;
    priceRefreshInFlight.current = true;
    setIsPriceRefreshing(true);
    setRefreshingSymbol(symbol ?? null);
    setRefreshStatus(symbol ? `Updating ${symbol} (0/1)` : "Preparing market-price update…");
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
      setRefreshStatus(`${result.symbol}: ${result.ok ? "updated" : "failed"} (1/1) • ${result.apiCalls ?? "Unknown"} calls used • ${result.remainingCalls ?? "Unknown"} remaining. Try another update when available.`);
      if (!result.ok) throw new Error(result.reason || "No quote available");
      await Promise.all([revalidatePrices(), revalidateUser()]);
      toast({ title: `${symbol} updated`, description: `${result.apiCalls} API calls used` });
    } catch (error) {
      toast({ title: `${symbol} could not be updated`, description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      endPriceRefresh();
    }
  }

  function handleAddAsset(prefillType?: string) {
    captureDialogOrigin();
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
      toast({ title: "No refreshable assets", description: refreshableCopy });
      return;
    }

    if (!beginPriceRefresh()) return;
    try {
      let completed = 0;
      const results = await refreshSymbolsSequentially({
        symbols,
        refreshSymbol: (symbol) => { setRefreshingSymbol(symbol); setRefreshStatus(`Updating ${symbol} (${completed}/${symbols.length})`); return refreshOneSymbol(symbol); },
        onResult: async (result, index, total) => {
          completed = index + 1;
          setRefreshStatus(`Updating ${result.symbol} (${index + 1}/${total}) • ${result.ok ? "updated" : "failed"}`);
          if (typeof result.remainingCalls === "number") setApiRemaining(result.remainingCalls);
          if (result.ok) await revalidatePrices();
          toast(
            result.ok
              ? { title: `${result.symbol} updated`, description: `${result.apiCalls} API call${result.apiCalls === 1 ? "" : "s"} used` }
              : { title: `${result.symbol} could not be updated`, description: result.reason || "No quote available", variant: "destructive" },
          );
        },
      });
      await Promise.all([revalidatePrices(), revalidateUser()]);
      const summary = summarizeRefreshResults(results, apiRemaining);
      setRefreshStatus(`${results.length}/${symbols.length} completed • ${summary.fetched} updated • ${results.filter(r => !r.ok).length} failed • ${symbols.length - results.length} skipped • ${summary.apiCalls ?? "Unknown"} calls used • ${summary.remainingCalls ?? "Unknown"} remaining. ${results.some(r => r.terminal) ? "Wait for provider cooldown or check market data settings before retrying." : "Ready for another update."}`);
      toast({ title: `${summary.fetched}/${summary.total} assets updated`, description: `${summary.apiCalls ?? "Unknown"} API calls used • ${summary.remainingCalls ?? "Unknown"} app-tracked calls remaining` });
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

  if (!router.isReady || (!demoMode && sessionStatus === "loading")) return <LoadingState />;
  if (!demoMode && userError && !user) return <WelcomeState error onRetry={() => { void revalidateUser(); }} retrying={portfolio.user.isValidating} />;
  if (!demoMode && sessionStatus === "authenticated" && (!user || (!prices && !pricesError))) return <LoadingState />;
  if (demoMode && !localAssets) return <LoadingState />;
  if (!demoMode && !user) return <WelcomeState />;

  return (
    <main id="wrapper">
      <AppHeader compact>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {demoMode ? <div className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Database className="h-4 w-4" />Anonymous local demo</div> : <Login />}
          {demoMode && <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => { window.localStorage.removeItem(DEMO_STORAGE_KEY); setAssets(demoAssets); }}><RotateCcw className="h-4 w-4 mr-2" />Reset demo</Button><Button asChild variant="outline" size="sm"><Link href="/">Exit demo</Link></Button></div>}
        </div>
      </AppHeader>

      {!demoMode && pricesError && <Alert className="mb-6"><AlertTitle>Saved holdings loaded</AlertTitle><AlertDescription>{prices ? "Cached prices could not be refreshed. Showing the last available cached values." : "Cached prices are temporarily unavailable. Showing saved holding values."}</AlertDescription></Alert>}
      <PortfolioOverview assets={assets} demoMode={demoMode} />
      <section aria-labelledby="assets-title">
        <div className="flex items-center justify-between gap-4 mb-3"><h2 tabIndex={-1} id="assets-title" className="text-2xl font-bold">Assets</h2><AssetControls handleUpdateValues={handleReloadPrices} onAdd={handleAddAsset} onSearch={handleSearchAndAddAsset} apiRemaining={apiRemaining} demoMode={demoMode} refreshDisabled={isPriceRefreshing} /></div>
        <div className="mb-3 flex gap-2" aria-label="Portfolio view"><Button size="sm" variant={view === "list" ? "default" : "outline"} aria-pressed={view === "list"} onClick={() => setView("list")}>Compact list</Button><Button size="sm" variant={view === "cards" ? "default" : "outline"} aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards</Button></div>
        {!demoMode && <p role="status" aria-live="polite" className="block mb-3 text-sm">{refreshStatus}</p>}
        <p className="block mb-3 text-sm">{filteredAssets.length} of {assets.filter(a => showDeleted || !a.isDeleted).length} holdings • Filtered value: {filteredAssets.reduce((sum, a) => sum + (a.value || 0), 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}{showDeleted ? " (includes deleted holdings)" : ""}. Active portfolio total above.</p>
        <div className="mb-3"><Filters counts={Object.fromEntries(["cash", "crypto", "metals", "stocks", "real_estate"].map(type => [type, assets.filter(a => a.type === type && (showDeleted || !a.isDeleted)).length]))} onClear={() => setSelectedTypes([])} showDeleted={showDeleted} onToggleDeleted={setShowDeleted} selectedTypes={selectedTypes} onToggleType={(type) => setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} sortBy={sortBy} onSortChange={setSortBy} /></div>
        {filteredAssets.length ? <AssetList assets={filteredAssets} view={view} demoMode={demoMode} sortBy={sortBy} handleUnDeleteAsset={(id) => setDeleted(id, false)} handleEditAsset={handleEditAsset} handleUpdatePrice={handleUpdatePrice} priceRefreshDisabled={isPriceRefreshing || (!demoMode && apiRemaining !== null && apiRemaining <= 0)} refreshingSymbol={refreshingSymbol} /> : <EmptyState hasFilters={selectedTypes.length > 0 || (!showDeleted && assets.some((asset) => asset.isDeleted))} onAdd={() => handleAddAsset()} onClear={() => setSelectedTypes([])} />}
      </section>

      {!demoMode && <Prices apiRemaining={apiRemaining} user={user} prices={prices} error={pricesError} onRevalidate={revalidatePrices} refreshDisabled={isPriceRefreshing} onRefreshStart={beginPriceRefresh} onRefreshEnd={endPriceRefresh} onBatchRefresh={handleReloadPrices} refreshStatus={refreshStatus} onRemainingChange={setApiRemaining} />}
      <Footer><TotalValue value={assets.filter((asset) => !asset.isDeleted).reduce((sum, asset) => sum + (asset.value || 0), 0)} /></Footer>
      <AssetDialog restoreFocus={restoreDialogOrigin} key={`${dialogOpen}-${editingAsset?._id ?? editingAsset?.id ?? "new"}`} open={dialogOpen} onOpenChange={setDialogOpen} initialValues={editingAsset} onSubmit={handleFormSubmit} onDelete={(id) => setDeleted(id, true)} onCancel={() => { setDialogOpen(false); setEditingAsset(null); }} isSaving={isSaving} />
    </main>
  );
}

function LoadingState() {
  return <main id="wrapper"><AppHeader><div className="h-9 mb-5" aria-hidden="true" /></AppHeader><PortfolioLoading /></main>;
}

function AppHeader({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <header className={compact ? "mb-4 compact-header" : "mb-8"}>
      {children}
      <p className="block text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Personal wealth, one clear view</p>
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-2">Asset Tracker</h1>
      <p className="block mt-3 max-w-2xl text-muted-foreground">Track stocks, crypto, metals, property and cash without losing sight of your overall allocation.</p>
    </header>
  );
}

function WelcomeState({ error = false, onRetry, retrying = false }: { error?: boolean; onRetry?: () => void; retrying?: boolean }) {
  if (error) return (
    <main id="wrapper">
      <AppHeader><div className="h-9 mb-5" aria-hidden="true" /></AppHeader>
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Live account unavailable</AlertTitle>
        <AlertDescription>The saved holdings could not be loaded. Retry to prepare your portfolio; no values are shown until it is ready.</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        {onRetry && <Button variant="outline" onClick={onRetry} disabled={retrying} aria-busy={retrying}>Retry portfolio</Button>}
        <Button asChild variant="ghost"><Link href="/?demo=true">Open interactive demo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      </div>
    </main>
  );
  return <main className="min-h-screen grid place-items-center px-6 py-16 bg-slate-50"><div className="w-full max-w-2xl text-center"><WalletCards className="mx-auto h-12 w-12" /><p className="block mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Multi-asset portfolio tracking</p><h1 className="mt-3 text-5xl font-extrabold tracking-tight">All your assets.<br />One honest overview.</h1><p className="block mx-auto mt-5 max-w-xl text-lg text-muted-foreground">Explore the product instantly with anonymized, local data. No account, database or market-data quota required.</p><div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"><Button asChild size="lg" className="w-full sm:w-auto"><Link href="/?demo=true">Open interactive demo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Login /></div></div></main>;
}

function EmptyState({ hasFilters, onAdd, onClear }: { hasFilters: boolean; onAdd: () => void; onClear: () => void }) {
  return <div className="rounded-xl border border-dashed p-10 text-center mb-8"><WalletCards className="mx-auto h-9 w-9 text-muted-foreground" /><h3 className="mt-4 font-semibold">{hasFilters ? "No assets match these filters" : "Your portfolio is empty"}</h3><p className="block mt-2 text-sm text-muted-foreground">{hasFilters ? "Clear the filters to see the complete portfolio." : "Add your first holding to start tracking its value."}</p><Button className="mt-5" variant={hasFilters ? "outline" : "default"} onClick={hasFilters ? onClear : onAdd}>{hasFilters ? "Clear category filters" : "Add first asset"}</Button></div>;
}
