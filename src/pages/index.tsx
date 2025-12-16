import AssetList from "@/components/AssetList";
import AssetControls from "@/components/AssetControls";
import Filters from "@/components/Filters";
import SnackBar from "@/components/SnackBar";
import Footer from "@/components/Footer";
import TotalValue from "@/components/TotalValue";
import Login from "@/components/Login";
import useSWR from "swr";
import axios, { AxiosError } from "axios";
import { useEffect, useState, FormEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import AssetDialog from "@/components/AssetDialog";
import { AssetType } from "@/components/Asset";
import Prices from "@/components/Prices";
import ApiLimitBadge from "@/components/ApiLimitBadge";

interface UserData {
  _id: string;
  email: string;
  assets: AssetType[];
}

export default function App() {
  const { toast } = useToast();
  const initialAssets: AssetType[] = [
    { id: 0, name: "Bitcoin", quantity: 0.01, notes: "", type: "crypto", abb: "btc", value: 400, baseValue: 40_000, isDeleted: false },
    { id: 1, name: "Ethereum", quantity: 1, notes: "", type: "crypto", abb: "eth", value: 4_000, baseValue: 4_000, isDeleted: false },
    { id: 2, name: "Silver", quantity: 4, notes: "", type: "metals", abb: "silver", value: 100, baseValue: 20.7, isDeleted: false },
    {
      id: 3,
      name: "Gold",
      quantity: 0.5,
      notes: "",
      type: "metals",
      abb: "gold",
      value: 950,
      baseValue: 1_900,
      isDeleted: false,
    },
    { id: 4, name: "Euro", quantity: 200, notes: "under the Pillow", type: "cash", abb: "eur", value: 200, baseValue: 1, isDeleted: false },
    { id: 5, name: "Beach house", quantity: 1, notes: "I wish", type: "real_estate", abb: "RE", value: 1, baseValue: 1, isDeleted: false },
  ];
  const [assets, setAssets] = useState<AssetType[]>(initialAssets);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Partial<AssetType> | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"value" | "name" | "date">("date");
  const [apiRemaining, setApiRemaining] = useState<number>(25);

  const apiClient = axios.create({
    baseURL: "/api",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const { data: user, isLoading } = useSWR<UserData>("/api/user");

  useEffect(() => {
    if (!user) {
      return;
    }

    // Load prices from DB and merge with assets
    const loadPricesAndUpdateAssets = async () => {
      try {
        const pricesResponse = await fetch("/api/prices");
        const pricesData = await pricesResponse.json();

        if (Array.isArray(pricesData)) {
          // Normalize symbols to uppercase and create quick lookup map
          const priceMap = new Map(pricesData.map((p: any) => [String(p.symbol || "").toUpperCase(), p.value]));

          // Update assets with baseValue from prices
          const updatedAssets = user.assets.map((asset: AssetType) => {
            const priceValue = priceMap.get(String(asset.abb || "").toUpperCase());
            if (priceValue) {
              return {
                ...asset,
                baseValue: priceValue,
                value: (asset.quantity || 0) * priceValue,
              };
            }
            return asset;
          });

          setAssets(updatedAssets);
        } else {
          setAssets(user.assets);
        }
      } catch (err) {
        console.error("Error loading prices:", err);
        setAssets(user.assets);
      }
    };

    loadPricesAndUpdateAssets();
  }, [user]);

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>, initialValues?: Partial<AssetType> | null) {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const formProps: Record<string, any> = Object.fromEntries(formData);
    const numericFields = ["quantity", "value", "baseValue"];
    numericFields.forEach((key) => {
      if (formProps[key] !== undefined && formProps[key] !== "") {
        formProps[key] = Number(formProps[key]);
      }
    });
    formProps.value = Number(formProps.quantity || 0) * Number(formProps.baseValue || 0);
    const idFromInitial = initialValues?._id ?? initialValues?.id;
    const id = idFromInitial ?? formProps.id;
    const isEdit = id !== undefined && id !== null && id !== "";
    try {
      if (isEdit) {
        await apiClient.put(`/user?action=update`, { id, ...formProps });
        setAssets((prev) => prev.map((a) => (a._id === id || a.id === id ? { ...a, ...(formProps as Partial<AssetType>) } : a)));
        toast({ title: "Asset updated" });
      } else {
        const payload = { ...formProps, userId: user?._id };
        const resp = await apiClient.post(`/user`, payload);
        const created: AssetType = resp.data;
        setAssets((prev) => [created, ...prev]);
        toast({ title: `Asset ${created.name} created` });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error saving asset";
      toast({ title: message, variant: "destructive" });
    }
    setDialogOpen(false);
    setEditingAsset(null);
  }

  async function handleDeleteAsset(assetId: string | number) {
    try {
      await apiClient.put(`/user?action=softDelete`, { id: assetId });
      setAssets((prev) => prev.map((a) => (a._id === assetId || a.id === assetId ? { ...a, isDeleted: true } : a)));
      const assetName = (assets || []).find((asset) => asset._id === assetId || asset.id === assetId)?.name || "Asset";
      toast({ title: `"${assetName}" deleted` });
    } catch (error) {
      console.error("Fehler beim Soft-Delete des Assets:", error);
      const message = error instanceof Error ? error.message : "Delete failed";
      toast({ title: message, variant: "destructive" });
    }
  }

  async function handleUnDeleteAsset(assetId: string | number) {
    try {
      await apiClient.put(`/user?action=softUndelete`, { id: assetId });
      setAssets((prev) => prev.map((a) => (a._id === assetId || a.id === assetId ? { ...a, isDeleted: false } : a)));
      const assetName = (assets || []).find((asset) => asset._id === assetId || asset.id === assetId)?.name || "Asset";
      toast({ title: `"${assetName}" restored` });
    } catch (error) {
      console.error("Fehler beim Soft-Undelete des Assets:", error);
      const message = error instanceof Error ? error.message : "Restore failed";
      toast({ title: message, variant: "destructive" });
    }
  }

  function handleEditAsset(id: string | number) {
    const asset = (assets || []).find((a) => a._id === id || a.id === id);
    setEditingAsset(asset || null);
    setDialogOpen(true);
  }

  function handleAddAsset(prefillType?: string) {
    setEditingAsset(prefillType ? { type: prefillType } : null);
    setDialogOpen(true);
  }

  function handleSearchAndAddAsset(symbol: string, name: string, assetClass?: string) {
    setEditingAsset({
      name: name,
      abb: symbol,
      quantity: 0,
      baseValue: 0,
      value: 0,
      type: assetClass || "",
      notes: "",
      isDeleted: false,
    });
    setDialogOpen(true);
  }

  async function handleReloadPrices() {
    try {
      const response = await apiClient.post("/prices/fetch");
      const data = response.data;

      if (data.fetched > 0) {
        // Reload prices from DB
        const pricesResponse = await fetch("/api/prices");
        const pricesData = await pricesResponse.json();

        if (Array.isArray(pricesData)) {
          const priceMap = new Map(pricesData.map((p: any) => [String(p.symbol || "").toUpperCase(), p.value]));

          const updatedAssets = assets.map((asset: AssetType) => {
            const priceValue = priceMap.get(String(asset.abb || "").toUpperCase());
            if (priceValue) {
              return {
                ...asset,
                baseValue: priceValue,
                value: (asset.quantity || 0) * priceValue,
              };
            }
            return asset;
          });

          setAssets(updatedAssets);
          toast({
            title: `Updated ${data.fetched} prices`,
            description: `${data.apiCalls} API calls • ${data.remainingCalls} calls remaining today`,
          });
        }
      } else {
        toast({ title: "No prices updated", description: "All prices are up to date" });
      }
    } catch (error) {
      const axError = error as any;
      if (axError.response?.status === 429) {
        toast({
          title: "API Limit Reached",
          description: "You've exceeded the free tier limit (25 calls/day). Try again tomorrow.",
          variant: "destructive",
        });
      } else {
        const message = error instanceof Error ? error.message : "Failed to reload prices";
        toast({ title: message, variant: "destructive" });
      }
    }
  }

  const handleToggleType = (type: string) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const getSortedAssets = (assets: AssetType[]) => {
    const sorted = [...assets];
    switch (sortBy) {
      case "value":
        return sorted.sort((a, b) => (b.value || 0) - (a.value || 0));
      case "name":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "date":
        // Neueste zuerst - Assets mit höherer ID oder _id sind neuer
        return sorted.sort((a, b) => {
          const idA = Number(a._id || a.id || 0);
          const idB = Number(b._id || b.id || 0);
          return idB - idA;
        });
      default:
        return sorted;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-lg text-muted-foreground">Loading your assets...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div id="wrapper">
        <Login />
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">Track your assets!</h1>
        <div id="assetControls" className="layoutElement">
          <AssetControls
            handleUpdateValues={handleReloadPrices}
            onAdd={handleAddAsset}
            onSearch={handleSearchAndAddAsset}
            apiRemaining={apiRemaining}
          />
        </div>
        <div className="mb-8">
          <Filters
            showDeleted={showDeleted}
            onToggleDeleted={setShowDeleted}
            selectedTypes={selectedTypes}
            onToggleType={handleToggleType}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        </div>
        {assets ? (
          <AssetList
            assets={getSortedAssets(assets)}
            showDeleted={showDeleted}
            selectedTypes={selectedTypes}
            handleDeleteAsset={handleDeleteAsset}
            handleUnDeleteAsset={handleUnDeleteAsset}
            handleEditAsset={handleEditAsset}
          ></AssetList>
        ) : (
          "Please add assets!"
        )}
        <Prices />
        {/* Hidden ApiLimitBadge to sync apiRemaining state */}
        <div className="hidden">
          <ApiLimitBadge onRemainingChange={setApiRemaining} />
        </div>
        <Footer>
          <TotalValue value={assets.filter((a) => !a.isDeleted).reduce((sum, asset) => sum + (asset.value || 0), 0)} />
        </Footer>
        <SnackBar />
        <AssetDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialValues={editingAsset}
          onSubmit={handleFormSubmit}
          onDelete={handleDeleteAsset}
          onCancel={() => {
            setDialogOpen(false);
            setEditingAsset(null);
          }}
        />
      </div>
    </>
  );
}
