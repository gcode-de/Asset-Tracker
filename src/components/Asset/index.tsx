import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, TrendingUp, Calendar, Wallet } from "lucide-react";

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
    <Card id={String(assetId)} className={`overflow-hidden h-full flex flex-col ${asset.isDeleted ? "opacity-50" : ""}`}>
      <div className="relative h-24 w-full bg-cover bg-center" style={{ backgroundImage: bgForType(asset.type) }} aria-hidden>
        <div className="absolute inset-0 bg-black/20" />
      </div>
      <CardHeader className="pt-4">
        <CardTitle className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 min-h-[3rem] flex items-center hyphens-auto" lang="de">
            {asset.name.length > 30 ? asset.name.substring(0, 36) + "..." : asset.name}
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
                Total Value{" "}
                {asset.priceUpdatedAt && (
                  <span>({new Date(asset.priceUpdatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })})</span>
                )}
              </div>
              <div className="font-bold text-lg text-primary">{asset.value?.toLocaleString("de-DE")} €</div>
            </div>
          </div>
        </div>

        {/* Units and Price - 2 wider columns */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-muted/50 rounded-md">
            <div className="flex min-w-0">
              <Coins className="h-4 w-4 text-muted-foreground mt-0.5 mr-1 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">Units</div>
            </div>
            <div className="font-semibold">{asset.quantity?.toLocaleString("de-DE")} €</div>
          </div>

          <div className="p-2 bg-muted/50 rounded-md">
            <div className="flex min-w-0">
              <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5 mr-1 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">Unit Price</div>
            </div>
            <div className="font-semibold">{asset.baseValue?.toLocaleString("de-DE")} €</div>
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
