import Asset from "@/components/Asset";

export default function AssetList({ assets, handleEditAsset, handleDeleteAsset }) {
  return (
    <div>
      {assets.map((asset) => (
        <Asset key={asset._id || asset.name} asset={asset} handleDeleteAsset={handleDeleteAsset} handleEditAsset={handleEditAsset} />
      ))}
    </div>
  );
}
