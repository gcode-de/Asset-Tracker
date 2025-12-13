import Asset from "@/components/Asset";

export default function AssetList({ assets, handleEditAsset, handleDeleteAsset, handleUnDeleteAsset, showDeleted = false, selectedTypes = [] }) {
  const visibleAssets = (assets || []).filter((a) => {
    const typeOk = selectedTypes.length ? selectedTypes.includes(a.type) : true;
    const deletedOk = showDeleted ? true : !a.isDeleted;
    return typeOk && deletedOk;
  });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {visibleAssets.map((asset) => (
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
