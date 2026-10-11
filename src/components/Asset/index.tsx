import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, TrendingUp, Wallet, RefreshCw } from "lucide-react";
import { currency, valuationLabel } from "@/lib/portfolio-ux";
import { isRefreshableAsset, preciousMetalSymbol } from "@/lib/price-refresh";

export interface AssetType {
  _id?: string | number;
  id?: string | number;
  name: string;
  quantity: number;
  notes?: string;
  type: string;
  abb?: string;
  value: number;
  baseValue: number;
  isDeleted: boolean;
  priceUpdatedAt?: string | Date;
  costBasis?: number | null;
  createdAt?: string;
  valuationSource?: "cached";
  quoteTimestamp?: string;
}

interface AssetProps {
  asset: AssetType;
  handleEditAsset: (id: string | number) => void;
  handleUnDeleteAsset?: (id: string | number) => void;
  handleUpdatePrice?: (symbol: string) => void;
  priceRefreshDisabled?: boolean;
  isPriceRefreshing?: boolean;
  compact?: boolean;
  demoMode?: boolean;
}

export default function Asset({ asset, handleEditAsset, handleUnDeleteAsset, handleUpdatePrice, priceRefreshDisabled = false, isPriceRefreshing = false, compact = false, demoMode = false }: AssetProps) {
  const bgForType = (type: string): string => {
    const key = (type ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "_");
    switch (key) {
      case "crypto":
        return "url('/images/crypto.jpg')";
      case "stocks":
        return "url('/images/stocks.jpg')";
      case "metals":
      case "metal":
      case "precious_metal":
        return "url('/images/metal.jpg')";
      case "cash":
        return "url('/images/cash.jpg')";
      case "real_estate":
      case "realestate":
        return "url('/images/real_estate.jpg')";
      default:
        return "url('/images/stocks.jpg')";
    }
  };

  const assetId = asset._id ?? asset.id;
  const isMetal = preciousMetalSymbol(asset) !== undefined;


  const actions = <div className="flex justify-end gap-1">        {asset.isDeleted ? (
          <Button id={`${asset.id}-restore-button`} variant="secondary" size="sm" onClick={() => handleUnDeleteAsset && handleUnDeleteAsset(assetId)} aria-label={`Restore ${asset.name}`}>
            Restore
          </Button>
        ) : (
          <>
            {handleUpdatePrice && isRefreshableAsset(asset) && (
              <Button
                id={`${asset.id}-update-button`}
                variant="ghost"
                size="sm"
                disabled={priceRefreshDisabled}
                aria-busy={isPriceRefreshing}
                onClick={() => handleUpdatePrice(asset.abb || asset.name || String(assetId))}
                aria-label={`Update price for ${asset.name}`}
              >
                <RefreshCw className={`h-4 w-4 ${isPriceRefreshing ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button id={`${asset.id}-edit-button`} variant="link" size="sm" onClick={() => handleEditAsset(assetId)} aria-label={`Edit ${asset.name}`}>
              Edit
            </Button>
          </>
        )}</div>;
  if (compact) return <article aria-labelledby={`asset-${assetId}-title`} className={`asset-row rounded-lg border p-3 ${asset.isDeleted ? "opacity-50" : ""}`}>
    <div className="flex min-w-0 items-start gap-2"><Coins className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><div className="min-w-0"><h3 id={`asset-${assetId}-title`} className="font-semibold break-words">{asset.name}</h3><p className="block text-sm text-muted-foreground">{asset.abb || "No symbol"} · {asset.type.replaceAll("_", " ")}</p></div></div>
    <div className="tabular-nums text-sm"><span className="md:sr-only text-muted-foreground">Quantity: </span>{asset.quantity.toLocaleString("de-DE", { maximumFractionDigits: 8 })}{isMetal ? " troy oz" : " units"}</div>
    <div className="tabular-nums text-sm md:text-right"><span className="md:sr-only text-muted-foreground">Price: </span>{currency.format(asset.baseValue)}{isMetal ? "/troy oz" : "/unit"}</div>
    <div className="text-right font-bold tabular-nums"><span className="sr-only">Value: </span>{currency.format(asset.value)}</div>
    <p className="asset-row-status block text-sm text-muted-foreground break-words">{valuationLabel(asset, demoMode)}</p>{actions}
  </article>;

  return (
    <Card id={String(assetId)} className={`overflow-hidden h-full flex flex-col ${asset.isDeleted ? "opacity-50" : ""}`} role="article" aria-labelledby={`asset-${assetId}-title`}>
      <div className="relative h-24 w-full bg-cover bg-center" style={{ backgroundImage: bgForType(asset.type) }} aria-hidden>
        <div className="absolute inset-0 bg-black/20" />
      </div>
      <CardHeader className="pt-4">
        <CardTitle className="flex items-start justify-between gap-2">
          <span id={`asset-${assetId}-title`} className="line-clamp-2 min-h-[3rem] flex items-center hyphens-auto" lang="en">
            {asset.name}
          </span>
          <Badge variant="secondary" className="flex-shrink-0">
            {asset.type}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm flex-1">
        {/* Total Value with date - Full width */}
        <div className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-md ">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Wallet className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
Total Value · {valuationLabel(asset, demoMode)}
              </div>
              <div className="font-bold text-lg text-primary">{currency.format(asset.value)}</div>
            </div>
          </div>
        </div>

        {/* Units and Price - 2 wider columns */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-muted/50 rounded-md">
            <div className="flex min-w-0">
              <Coins className="h-4 w-4 text-muted-foreground mt-0.5 mr-1 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">{isMetal ? "Units (troy oz)" : "Units"}</div>
            </div>
            <div className="font-semibold">{asset.quantity?.toLocaleString("de-DE")}</div>
          </div>

          <div className="p-2 bg-muted/50 rounded-md">
            <div className="flex min-w-0">
              <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5 mr-1 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">{isMetal ? "Unit Price (€/troy oz)" : "Unit Price"}</div>
            </div>
            <div className="font-semibold">{currency.format(asset.baseValue)}</div>
          </div>
        </div>

        {/* Notes section */}
        {asset.notes && (
          <div className="pt-1">
            {/* <div className="text-xs text-muted-foreground mb-1">Notes</div> */}
            <div className="text-xs line-clamp-2">{asset.notes}</div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-end gap-2 px-3 py-2 mt-auto">
        {actions}
      </CardFooter>
    </Card>
  );
}
