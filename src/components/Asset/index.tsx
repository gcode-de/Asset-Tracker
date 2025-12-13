import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
}

interface AssetProps {
  asset: AssetType;
  handleEditAsset: (id: string | number) => void;
  handleDeleteAsset?: (id: string | number) => void;
  handleUnDeleteAsset?: (id: string | number) => void;
}

export default function Asset({ asset, handleEditAsset, handleDeleteAsset, handleUnDeleteAsset }: AssetProps) {
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

  return (
    <Card id={String(assetId)} className="overflow-hidden h-full flex flex-col">
      <div className="relative h-24 w-full bg-cover bg-center" style={{ backgroundImage: bgForType(asset.type) }} aria-hidden>
        <div className="absolute inset-0 bg-black/20" />
      </div>
      <CardHeader className="pt-4">
        <CardTitle className="flex items-center justify-between">
          <span>{asset.name}</span>
          <Badge variant="secondary">{asset.type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div>Units: {asset.quantity}</div>
        <div>
          Current Value: {asset.value?.toLocaleString("de-DE")}€ (Unit Price {asset.baseValue?.toLocaleString("de-DE")}€)
        </div>
        <div>Notes: {asset.notes}</div>
      </CardContent>
      <CardFooter className="flex items-center justify-end gap-2 px-3 py-2 mt-auto">
        {asset.isDeleted ? (
          <Button id={`${asset.id}-restore-button`} variant="secondary" size="sm" onClick={() => handleUnDeleteAsset && handleUnDeleteAsset(assetId)}>
            Restore
          </Button>
        ) : null}
        <Button id={`${asset.id}-edit-button`} variant="link" size="sm" onClick={() => handleEditAsset(assetId)}>
          edit
        </Button>
      </CardFooter>
    </Card>
  );
}
