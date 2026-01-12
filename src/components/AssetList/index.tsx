import Asset, { AssetType } from "@/components/Asset";
import { useMemo } from "react";

interface AssetListProps {
  assets: AssetType[];
  handleEditAsset: (id: string | number) => void;
  handleDeleteAsset?: (id: string | number) => void;
  handleUnDeleteAsset?: (id: string | number) => void;
  sortBy?: "value" | "name" | "date";
}

export default function AssetList({
  assets,
  handleEditAsset,
  handleDeleteAsset,
  handleUnDeleteAsset,
  sortBy = "date",
}: AssetListProps) {
  const sortedAssets = useMemo(() => {
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
  }, [assets, sortBy]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
      {sortedAssets.map((asset) => (
        <Asset
          key={asset._id || asset.name}
          asset={asset}
          handleDeleteAsset={handleDeleteAsset}
          handleUnDeleteAsset={handleUnDeleteAsset}
          handleEditAsset={handleEditAsset}
        />
      ))}
    </div>
  );
}
