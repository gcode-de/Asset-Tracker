import AssetList from "@/components/AssetList";
import AssetControls from "@/components/AssetControls";
import Filters from "@/components/Filters";
import SnackBar from "@/components/SnackBar";
import Footer from "@/components/Footer";
import TotalValue from "@/components/TotalValue";
import Login from "@/components/Login";
import useSWR from "swr";
import axios from "axios";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast.js";
import AssetDialog from "@/components/AssetDialog";

export default function App() {
  const { toast } = useToast();
  const initialAssets = [
    { id: 0, name: "Bitcoin", quantity: 0.01288, notes: "", type: "crypto", abb: "btc", value: 10_000, baseValue: 40_000, isDeleted: false },
    { id: 1, name: "Ethereum", quantity: 0.029, notes: "", type: "crypto", abb: "eth", value: 10_000, baseValue: 4_000, isDeleted: false },
    { id: 2, name: "Silver", quantity: 754, notes: "", type: "metals", abb: "silver", value: 10_000, baseValue: 20.7, isDeleted: false },
    {
      id: 3,
      name: "Gold",
      quantity: 3.5,
      notes: "recently bought",
      type: "metals",
      abb: "gold",
      value: 10_000,
      baseValue: 1_900,
      isDeleted: false,
    },
    { id: 4, name: "Euro", quantity: 200, notes: "under the Pillow", type: "cash", abb: "eur", value: 200, baseValue: 1, isDeleted: false },
    { id: 5, name: "Beach house", quantity: 1, notes: "I wish", type: "real_estate", abb: "RE", value: 1, baseValue: 1, isDeleted: false },
  ];
  const [assets, setAssets] = useState(initialAssets);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]);

  const apiClient = axios.create({
    baseURL: "/api",
    headers: {
      "Content-Type": "application/json",
    },
  });

  async function fetchCryptoValueFromApi(fromCurrency) {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=EUR&apikey=${process.env.NEXT_PUBLIC_ALPHAVANTAGE}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const content = data?.["Realtime Currency Exchange Rate"];
      console.log("API", content?.["1. From_Currency Code"], "to", content?.["3. To_Currency Code"], content?.["5. Exchange Rate"]);
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchStockValueFromApi(symbol) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.NEXT_PUBLIC_ALPHAVANTAGE}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const content = data?.["Global Quote"];
      console.log("API", content?.["01. symbol"], content?.["05. price"]);
    } catch (error) {
      console.error(error);
    }
  }

  const { data: user, isLoading, error, mutate } = useSWR("/api/user");

  useEffect(() => {
    if (!user) {
      return;
    }
    setAssets(user.assets);
    // fetchCryptoValueFromApi("BTC");
    // fetchCryptoValueFromApi("ETH");
    // fetchCryptoValueFromApi("SOL");
    // fetchCryptoValueFromApi("SHIB");
    fetchStockValueFromApi("4GLD.DE");
  }, [user]);

  async function handleFormSubmit(event, initialValues) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formProps = Object.fromEntries(formData);
    const numericFields = ["quantity", "value", "baseValue"];
    numericFields.forEach((key) => {
      if (formProps[key] !== undefined && formProps[key] !== "") {
        formProps[key] = Number(formProps[key]);
      }
    });
    // Sicherstellen, dass Current Value konsistent berechnet wird
    formProps.value = Number(formProps.quantity || 0) * Number(formProps.baseValue || 0);
    const idFromInitial = initialValues?._id ?? initialValues?.id;
    const id = idFromInitial ?? formProps.id;
    const isEdit = id !== undefined && id !== null && id !== "";
    try {
      if (isEdit) {
        await apiClient.put(`/user?action=update`, { id, ...formProps });
        setAssets((prev) => prev.map((a) => (a._id === id || a.id === id ? { ...a, ...formProps } : a)));
        toast({ title: "Asset updated" });
      } else {
        const payload = { ...formProps, userId: user?._id };
        const resp = await apiClient.post(`/user`, payload);
        const created = resp.data;
        setAssets((prev) => [created, ...prev]);
        toast({ title: `Asset ${created.name} created` });
      }
    } catch (e) {
      toast({ title: e.message || "Error saving asset", variant: "destructive" });
    }
    setDialogOpen(false);
    setEditingAsset(null);
  }

  function resetForm() {
    // shadcn Inputs benötigen kein manuelles Reset hier
  }

  async function handleDeleteAsset(assetId) {
    try {
      await apiClient.put(`/user?action=softDelete`, { id: assetId });
      setAssets((prev) => prev.map((a) => (a._id === assetId || a.id === assetId ? { ...a, isDeleted: true } : a)));
      const assetName = (assets || []).find((asset) => asset._id === assetId || asset.id === assetId)?.name || "Asset";
      toast({ title: `"${assetName}" deleted` });
    } catch (error) {
      console.error("Fehler beim Soft-Delete des Assets:", error);
      toast({ title: error.message || "Delete failed", variant: "destructive" });
    }
  }

  async function handleUnDeleteAsset(assetId) {
    try {
      await apiClient.put(`/user?action=softUndelete`, { id: assetId });
      setAssets((prev) => prev.map((a) => (a._id === assetId || a.id === assetId ? { ...a, isDeleted: false } : a)));
      const assetName = (assets || []).find((asset) => asset._id === assetId || asset.id === assetId)?.name || "Asset";
      toast({ title: `"${assetName}" restored` });
    } catch (error) {
      console.error("Fehler beim Soft-Undelete des Assets:", error);
      toast({ title: error.message || "Restore failed", variant: "destructive" });
    }
  }

  function handleEditAsset(id) {
    const asset = (assets || []).find((a) => a._id === id || a.id === id);
    setEditingAsset(asset || null);
    setDialogOpen(true);
  }

  function handleAddAsset(prefillType) {
    setEditingAsset(prefillType ? { type: prefillType } : null);
    setDialogOpen(true);
  }

  const handleToggleType = (type) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  function displayToast(message) {
    toast({ title: message });
  }

  function displaySnackbar(message, buttonText, buttonFunction) {
    toast({ title: message, action: { label: buttonText, onClick: buttonFunction } });
  }

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
        {/* <Form onFormSubmit={handleFormSubmit} resetForm={resetForm} /> */}
        <div id="assetControls" className="layoutElement">
          <AssetControls handleUpdateValues={() => {}} onAdd={handleAddAsset} />
        </div>
        <div className="mb-8">
          <Filters showDeleted={showDeleted} onToggleDeleted={setShowDeleted} selectedTypes={selectedTypes} onToggleType={handleToggleType} />
        </div>
        {assets ? (
          <AssetList
            assets={assets}
            showDeleted={showDeleted}
            selectedTypes={selectedTypes}
            handleDeleteAsset={handleDeleteAsset}
            handleUnDeleteAsset={handleUnDeleteAsset}
            handleEditAsset={handleEditAsset}
          ></AssetList>
        ) : (
          "Please add assets!"
        )}
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
