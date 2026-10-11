import Asset, { AssetType } from "@/components/Asset";
import { useMemo } from "react";
import { sortHoldings } from "@/lib/portfolio-view";

interface AssetListProps {
  assets: AssetType[];
  handleEditAsset: (id: string | number) => void;
  handleUnDeleteAsset?: (id: string | number) => void;
  handleUpdatePrice?: (symbol: string) => void;
  priceRefreshDisabled?: boolean;
  refreshingSymbol?: string | null;
  view?: "list" | "cards";
  demoMode?: boolean;
  sortBy?: "value" | "name" | "date";
}

export default function AssetList({
  assets,
  handleEditAsset,
  handleUnDeleteAsset,
  handleUpdatePrice,
  priceRefreshDisabled,
  refreshingSymbol,
  sortBy = "date",
  view = "cards",
  demoMode = false,
}: AssetListProps) {
  const sortedAssets = useMemo(() => sortHoldings(assets, sortBy), [assets, sortBy]);
  return (
    <div className={view === "list" ? "space-y-2 mb-4" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4"}>
      {sortedAssets.map((asset) => (
        <Asset
          key={asset._id ?? asset.id ?? asset.name}
          compact={view === "list"}
          demoMode={demoMode}
          asset={asset}
          handleUnDeleteAsset={handleUnDeleteAsset}
          handleEditAsset={handleEditAsset}
          handleUpdatePrice={handleUpdatePrice}
          priceRefreshDisabled={priceRefreshDisabled}
          isPriceRefreshing={refreshingSymbol === (asset.abb || asset.name || String(asset._id ?? asset.id))}
        />
      ))}
    </div>
  );
}
